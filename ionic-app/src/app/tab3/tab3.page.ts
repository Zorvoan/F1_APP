import {Component, inject, OnInit} from '@angular/core';
import { OpenF1Service } from '../services/openf1.service';
import type { Meeting } from '../models/f1';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit {
  meetings: Meeting[] = [];
  loading = true;
  error: string | null = null;
  lastUpdated: Date | null = null;
  championshipYear = 2025;

  readonly minYear = 2023;
  readonly maxYear = 2025;
  readonly yearOptions = Array.from({ length: this.maxYear - this.minYear + 1 }, (_, index) => this.maxYear - index);

  readonly yearLabel = 'Rok';
  readonly titleLabel = (year: number) => `Kalendar zavodu ${year}`;
  readonly loadingLabel = 'Nacitani dat...';
  readonly errorLabel = 'Chyba pri nacitani dat';
  readonly retryLabel = 'Zkusit znovu';
  readonly lastUpdatedLabel = 'Posledni aktualizace';
  readonly noDataLabel = 'Pro vybrany rok nejsou dostupna zadna data';

  private readonly openF1 = inject(OpenF1Service);

  ngOnInit() {
    this.fetchData();
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

      const meetings = await this.openF1.getMeetings(this.championshipYear);
      if (meetings.length === 0) {
        throw new Error(this.noDataLabel);
      }

      this.meetings = meetings;
      this.lastUpdated = new Date();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Neznama chyba';
    } finally {
      this.loading = false;
    }
  }
}
