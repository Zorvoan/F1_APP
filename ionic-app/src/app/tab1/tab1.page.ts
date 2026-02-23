import { Component, OnDestroy, OnInit } from '@angular/core';
import { OpenF1Service } from '../services/openf1.service';
import type { ChampionshipDriver, Driver } from '../models/f1';

type DriverWithInfo = ChampionshipDriver & Partial<Driver>;

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy {
  readonly language: 'cs' | 'en' = 'cs';
  drivers: DriverWithInfo[] = [];
  loading = true;
  error: string | null = null;
  lastUpdated: Date | null = null;
  championshipYear = 2025;

  readonly minYear = 2023;
  readonly maxYear = 2025;
  readonly yearOptions = Array.from({ length: this.maxYear - this.minYear + 1 }, (_, index) => this.maxYear - index);

  private refreshIntervalId: ReturnType<typeof setInterval> | null = null;

  private readonly translations = {
    cs: {
      title: (year: number) => `Mistrovstvi jezdcu ${year}`,
      yearLabel: 'Rok',
      points: 'Body',
      change: 'Zmena',
      loading: 'Nacitani dat...',
      error: 'Chyba pri nacitani dat',
      retry: 'Zkusit znovu',
      lastUpdated: 'Posledni aktualizace',
      noDataAnyYear: 'Pro vybrany rozsah roku nejsou dostupna zadna data',
      unknownDriver: 'Jezdec'
    },
    en: {
      title: (year: number) => `Drivers Championship ${year}`,
      yearLabel: 'Year',
      points: 'Points',
      change: 'Change',
      loading: 'Loading data...',
      error: 'Error loading data',
      retry: 'Retry',
      lastUpdated: 'Last updated',
      noDataAnyYear: 'No data available for the selected year range',
      unknownDriver: 'Driver'
    }
  };

  constructor(private readonly openF1: OpenF1Service) {}

  ngOnInit() {
    this.fetchData();
    this.refreshIntervalId = setInterval(() => this.fetchData(), 60000);
  }

  ngOnDestroy() {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
    }
  }

  get t() {
    return this.translations[this.language];
  }

  async onYearChange(value: number) {
    this.championshipYear = value;
    await this.fetchData();
  }

  async fetchData() {
    try {
      this.loading = true;
      this.error = null;
      this.lastUpdated = null;

      const { session, year } = await this.openF1.getLatestSessionForYearOrPrevious(this.championshipYear, this.minYear);
      if (!session || !year) {
        throw new Error(this.t.noDataAnyYear);
      }

      if (year !== this.championshipYear) {
        this.championshipYear = year;
      }

      const loadData = async () => {
        return await this.openF1.getChampionshipDriversWithInfo(session.session_key);
      };

      let data = await loadData();
      if (data.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
        data = await loadData();
      }

      if (data.length === 0) {
        throw new Error(`No championship standings available for ${year}`);
      }

      this.drivers = data;
      this.lastUpdated = new Date();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      this.loading = false;
    }
  }

  getChangeValue(current: number, start: number) {
    const diff = start - current;
    if (diff > 0) return `+${diff}`;
    if (diff < 0) return `${diff}`;
    return '-';
  }

  getChangeClass(current: number, start: number) {
    const diff = start - current;
    if (diff > 0) return 'ion-text-success';
    if (diff < 0) return 'ion-text-danger';
    return 'ion-text-medium';
  }
}
