import { Injectable } from '@angular/core';
import type {
  CarData,
  ChampionshipDriver,
  ChampionshipTeam,
  Driver,
  Meeting,
  Position,
  Session
} from '../models/f1';

const BASE_URL = 'https://api.openf1.org/v1';

@Injectable({
  providedIn: 'root'
})
export class OpenF1Service {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 500;
  private requestQueue: Promise<void> = Promise.resolve();
  private readonly latestSessionCache = new Map<number, { session: Session | null; timestamp: number }>();
  private readonly latestSessionCacheTtlMs = 5 * 60 * 1000;

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private normalizeHeadshotUrl(url?: string): string {
    if (!url) return '';
    const trimmed = url.trim();
    const firstIndex = trimmed.indexOf('http');
    if (firstIndex === -1) return trimmed;
    const secondIndex = trimmed.indexOf('http', firstIndex + 4);
    if (secondIndex === -1) return trimmed;
    return trimmed.slice(0, secondIndex);
  }

  private scheduleRequest<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.requestQueue.then(fn, fn);
    this.requestQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async fetchWithRateLimit<T>(url: string, attempt = 0): Promise<T> {
    return this.scheduleRequest(async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minRequestInterval) {
        await this.sleep(this.minRequestInterval - timeSinceLastRequest);
      }

      this.lastRequestTime = Date.now();

      const response = await fetch(url);

      if (!response.ok) {
        const shouldRetry = response.status === 429 || response.status === 503;
        if (shouldRetry && attempt < 3) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 0;
          const backoffMs = retryAfterMs || (800 * Math.pow(2, attempt));
          await this.sleep(backoffMs);
          return this.fetchWithRateLimit<T>(url, attempt + 1);
        }

        throw new Error(`API error: ${response.status} - ${response.statusText}`);
      }

      return response.json();
    });
  }

  async getLatestSession(): Promise<Session | null> {
    try {
      const sessions = await this.fetchWithRateLimit<Session[]>(`${BASE_URL}/sessions?session_key=latest`);
      return sessions[0] || null;
    } catch (error) {
      console.error('Error fetching latest session:', error);
      return null;
    }
  }

  async getLatestMeeting(): Promise<Meeting | null> {
    try {
      const meetings = await this.fetchWithRateLimit<Meeting[]>(`${BASE_URL}/meetings?meeting_key=latest`);
      return meetings[0] || null;
    } catch (error) {
      console.error('Error fetching latest meeting:', error);
      return null;
    }
  }

  async getDrivers(sessionKey: string | number = 'latest'): Promise<Driver[]> {
    try {
      const drivers = await this.fetchWithRateLimit<Driver[]>(`${BASE_URL}/drivers?session_key=${sessionKey}`);
      return drivers.map(driver => ({
        ...driver,
        headshot_url: this.normalizeHeadshotUrl(driver.headshot_url)
      }));
    } catch (error) {
      console.error('Error fetching drivers:', error);
      return [];
    }
  }

  async getChampionshipDrivers(sessionKey: string | number = 'latest'): Promise<ChampionshipDriver[]> {
    try {
      const data = await this.fetchWithRateLimit<ChampionshipDriver[]>(`${BASE_URL}/championship_drivers?session_key=${sessionKey}`);
      return data.sort((a, b) => a.position_current - b.position_current);
    } catch (error) {
      console.error('Error fetching championship drivers:', error);
      return [];
    }
  }

  async getChampionshipTeams(sessionKey: string | number = 'latest'): Promise<ChampionshipTeam[]> {
    try {
      const data = await this.fetchWithRateLimit<ChampionshipTeam[]>(`${BASE_URL}/championship_teams?session_key=${sessionKey}`);
      return data.sort((a, b) => a.position_current - b.position_current);
    } catch (error) {
      console.error('Error fetching championship teams:', error);
      return [];
    }
  }

  async getCarData(
    driverNumber: number,
    sessionKey: string | number = 'latest',
    limit = 100
  ): Promise<CarData[]> {
    try {
      return await this.fetchWithRateLimit<CarData[]>(
        `${BASE_URL}/car_data?session_key=${sessionKey}&driver_number=${driverNumber}&limit=${limit}`
      );
    } catch (error) {
      console.error('Error fetching car data:', error);
      return [];
    }
  }

  async getPositions(sessionKey: string | number = 'latest'): Promise<Position[]> {
    try {
      return await this.fetchWithRateLimit<Position[]>(`${BASE_URL}/position?session_key=${sessionKey}`);
    } catch (error) {
      console.error('Error fetching positions:', error);
      return [];
    }
  }

  async getSessions(year = new Date().getFullYear()): Promise<Session[]> {
    try {
      return await this.fetchWithRateLimit<Session[]>(`${BASE_URL}/sessions?year=${year}`);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  }

  async getLatestSessionForYear(year: number): Promise<Session | null> {
    try {
      const cached = this.latestSessionCache.get(year);
      if (cached && Date.now() - cached.timestamp < this.latestSessionCacheTtlMs) {
        return cached.session;
      }

      const sessions = await this.getSessions(year);
      if (sessions.length === 0) {
        this.latestSessionCache.set(year, { session: null, timestamp: Date.now() });
        return null;
      }

      const raceSessions = sessions.filter(session => {
        const type = session.session_type?.toLowerCase();
        const name = session.session_name?.toLowerCase();
        return type === 'race' || Boolean(name && name.includes('race'));
      });

      const candidates = raceSessions.length > 0 ? raceSessions : sessions;

      const sorted = candidates
        .slice()
        .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());

      const latest = sorted[0] || null;
      this.latestSessionCache.set(year, { session: latest, timestamp: Date.now() });
      return latest;
    } catch (error) {
      console.error('Error fetching latest session for year:', error);
      return null;
    }
  }

  async getLatestSessionForYearOrPrevious(
    year: number,
    minYear = 2014
  ): Promise<{ session: Session | null; year: number | null }> {
    for (let currentYear = year; currentYear >= minYear; currentYear -= 1) {
      const session = await this.getLatestSessionForYear(currentYear);
      if (session) {
        return { session, year: currentYear };
      }
    }

    return { session: null, year: null };
  }

  async getChampionshipDriversWithInfo(
    sessionKey: string | number = 'latest'
  ): Promise<(ChampionshipDriver & Partial<Driver>)[]> {
    const [championshipData, drivers] = await Promise.all([
      this.getChampionshipDrivers(sessionKey),
      this.getDrivers(sessionKey)
    ]);

    return championshipData
      .map(champDriver => {
        const driverInfo = drivers.find(d => d.driver_number === champDriver.driver_number);
        return {
          ...champDriver,
          ...driverInfo
        };
      })
      .filter(driver => Boolean(driver.full_name || driver.broadcast_name || driver.name_acronym));
  }

  async getChampionshipTeamsWithColors(
    sessionKey: string | number = 'latest'
  ): Promise<(ChampionshipTeam & { team_colour?: string })[]> {
    const [championshipData, drivers] = await Promise.all([
      this.getChampionshipTeams(sessionKey),
      this.getDrivers(sessionKey)
    ]);

    return championshipData.map(champTeam => {
      const teamDriver = drivers.find(d => d.team_name === champTeam.team_name);
      return {
        ...champTeam,
        team_colour: teamDriver?.team_colour
      };
    });
  }
}
