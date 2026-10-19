// Routes run in daylight only. Times come from the sun at the route itself, so
// the November clock change and the shrinking winter days handle themselves.
import SunCalc from "suncalc";

/** Last start is this long before sunset: nobody should begin a route they can't finish in daylight. */
export const START_CUTOFF_MIN = 45;

export type Daylight = {
  sunrise: string;
  sunset: string;
  lastStart: string;
  canStart: boolean;
  isDark: boolean;
  reason: string | null;
};

export function daylight(lat: number, lon: number, now = new Date()): Daylight {
  const t = SunCalc.getTimes(now, lat, lon);
  const lastStart = new Date(t.sunset.getTime() - START_CUTOFF_MIN * 60_000);
  const isDark = now < t.sunrise || now > t.sunset;
  const canStart = now >= t.sunrise && now <= lastStart;
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  let reason: string | null = null;
  if (now < t.sunrise) reason = `Routes open at sunrise, ${fmt(t.sunrise)}.`;
  else if (now > lastStart) reason = `Too close to sunset (${fmt(t.sunset)}). Routes open again at sunrise.`;
  return { sunrise: fmt(t.sunrise), sunset: fmt(t.sunset), lastStart: fmt(lastStart), canStart, isDark, reason };
}
