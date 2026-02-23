import { Component, OnDestroy, OnInit } from '@angular/core';
import { OpenF1Service } from '../services/openf1.service';
import type { CarData, Driver, Position } from '../models/f1';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit, OnDestroy {
  readonly language: 'cs' | 'en' = 'cs';
  drivers: Driver[] = [];
  selectedDriver: number | null = null;
  carData: CarData[] = [];
  positions: Position[] = [];
  loading = true;
  error: string | null = null;
  isLive = false;

  private liveIntervalId: ReturnType<typeof setInterval> | null = null;

  private readonly translations = {
    cs: {
      title: 'Telemetrie vozu',
      selectDriver: 'Vyberte jezdce',
      speed: 'Rychlost',
      throttle: 'Plyn',
      brake: 'Brzda',
      rpm: 'Otacky',
      gear: 'Prevodovka',
      drs: 'DRS',
      live: 'Zive',
      loading: 'Nacitani...',
      error: 'Chyba pri nacitani dat',
      position: 'Pozice',
      lastLap: 'Posledni kolo',
      kmh: 'km/h',
      drsOpen: 'Otevreno',
      drsClosed: 'Zavreno',
      notAvailable: 'Neni k dispozici',
      refreshRate: 'Aktualizace kazdych 5 sekund',
      noSession: 'Momentalne neprobiha zadny zavod'
    },
    en: {
      title: 'Car Telemetry',
      selectDriver: 'Select Driver',
      speed: 'Speed',
      throttle: 'Throttle',
      brake: 'Brake',
      rpm: 'RPM',
      gear: 'Gear',
      drs: 'DRS',
      live: 'Live',
      loading: 'Loading...',
      error: 'Error loading data',
      position: 'Position',
      lastLap: 'Last Lap',
      kmh: 'km/h',
      drsOpen: 'Open',
      drsClosed: 'Closed',
      notAvailable: 'Not available',
      refreshRate: 'Refreshing every 5 seconds',
      noSession: 'No race session is currently active'
    }
  };

  constructor(private readonly openF1: OpenF1Service) {}

  ngOnInit() {
    this.fetchDrivers();
  }

  ngOnDestroy() {
    this.stopLive();
  }

  get t() {
    return this.translations[this.language];
  }

  get latestData(): CarData | null {
    return this.carData.length > 0 ? this.carData[this.carData.length - 1] : null;
  }

  get currentPosition(): number | null {
    return this.positions.length > 0 ? this.positions[this.positions.length - 1].position : null;
  }

  async fetchDrivers() {
    try {
      const session = await this.openF1.getLatestSession();
      if (!session) {
        this.error = this.t.noSession;
        return;
      }

      const driversData = await this.openF1.getDrivers(session.session_key);
      this.drivers = driversData;
      if (driversData.length > 0 && !this.selectedDriver) {
        this.selectedDriver = driversData[0].driver_number;
      }

      await this.fetchTelemetry();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  async onDriverChange(value: number) {
    this.selectedDriver = value;
    await this.fetchTelemetry();
  }

  onLiveToggle(value: boolean) {
    this.isLive = value;
    if (this.isLive) {
      this.startLive();
    } else {
      this.stopLive();
    }
  }

  startLive() {
    this.stopLive();
    this.liveIntervalId = setInterval(() => this.fetchTelemetry(), 5000);
  }

  stopLive() {
    if (this.liveIntervalId) {
      clearInterval(this.liveIntervalId);
      this.liveIntervalId = null;
    }
  }

  async fetchTelemetry() {
    if (!this.selectedDriver) return;

    try {
      this.loading = true;
      const session = await this.openF1.getLatestSession();
      if (!session) {
        this.error = this.t.noSession;
        return;
      }

      const [telemetryData, positionsData] = await Promise.all([
        this.openF1.getCarData(this.selectedDriver, session.session_key, 10),
        this.openF1.getPositions(session.session_key)
      ]);

      this.carData = telemetryData;
      this.positions = positionsData.filter(p => p.driver_number === this.selectedDriver);
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      this.loading = false;
    }
  }
}
