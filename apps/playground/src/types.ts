export interface ThemeColors {
  bg: string;
  text: string;
  primary: string;
  primaryText: string;
  secondary: string;
  accent: string;
  accentText: string;
  border: string;
  shape1: string;
  shape2: string;
  shape3: string;
  cardBg: string;
  cardAlt: string;
  cardAltText: string;
  shadow: string;
  filter: string;
  pattern: string;
}

export interface ThemeStrings {
  titleSuffix: string;
  desc: string;
  selectFile: string;
  outputFormat: string;
  lossySource: string;
  startCompress: string;
  processing: string;
  quote: string;
  original: string;
  size: string;
  masterpiece: string;
  newSize: string;
  time: string;
  download: string;
}

export interface Theme {
  id: string;
  language: string;
  person: string;
  colors: ThemeColors;
  strings: ThemeStrings;
}

export type FeedbackType = 'click' | 'shift' | 'success' | 'tick';

export interface CompressionStats {
  origSize: number;
  newSize: number;
  ratio: number;
  time: number;
  format: string;
}
