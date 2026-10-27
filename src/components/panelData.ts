export interface PanelDef {
  id: string;
  index: number;
  right: boolean;
  sector?: string;
  sectorName?: string;
  heading: string;
  headingLevel: 1 | 2;
  splitChars?: boolean;
  lede?: string;
  body?: string;
  hasNumeral?: boolean;
}

export const PANELS: PanelDef[] = [
  { id: 's0', index: 0, right: false, heading: 'Lap One', headingLevel: 1, splitChars: true, lede: 'One car, one circuit, no brakes on the page. Scroll to drive it.' },
  { id: 's1', index: 1, right: true, sector: 'S1', sectorName: 'Shape', heading: 'Every line has a job', headingLevel: 2, body: 'Splitter, vents, mirrors, wing. Nothing on a GT3 car is there to look good. The silhouette is what is left after a long argument with the air.', hasNumeral: true },
  { id: 's2', index: 2, right: false, sector: 'S2', sectorName: 'Air', heading: 'Watch the wind move', headingLevel: 2, body: 'Streamlines climb the nose, skim the roof and tear off the wing. Scroll faster and more air goes over the body.', hasNumeral: true },
  { id: 's3', index: 3, right: true, sector: 'S3', sectorName: 'Brake', heading: 'Stopping is the fast part', headingLevel: 2, body: 'The discs glow long before the car looks slow. Speed is spent in the braking zone, and that is where a lap is won.', hasNumeral: true },
  { id: 's4', index: 4, right: false, sector: 'S4', sectorName: 'Night', heading: 'After dark it becomes a line', headingLevel: 2, body: 'Headlights, light gantries, the white edge of the track. Flat out, the world is reduced to streaks and you read the road by its rhythm.', hasNumeral: true },
  { id: 's5', index: 5, right: false, sector: 'S5', sectorName: 'Flag', heading: 'From above, it is one line', headingLevel: 2, hasNumeral: false },
];
