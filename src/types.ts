export interface Champion {
  id: string;
  name: string;
  title: string;
  tags: string[];
  image: {
    full: string;
  };
}

export interface GameState {
  gameNumber: number;
  bluePicks: string[];
  redPicks: string[];
}

export type DraftMode = 'global' | 'team';
