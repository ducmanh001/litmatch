export type AnalyticsPropertyValue = string | number | boolean | null;

export interface AnalyticsEvent {
  name: string;
  distinctId?: string;
  properties?: Readonly<Record<string, AnalyticsPropertyValue>>;
}

/** Analytics is an optional side effect; provider concerns stay outside business modules. */
export abstract class AnalyticsPort {
  abstract track(event: AnalyticsEvent): Promise<void>;
}
