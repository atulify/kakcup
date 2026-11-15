// JSON response shapes returned by the Rust API.
export interface User {
  id: string;
  username: string;
  role: string;
}

export interface Year {
  id: string;
  year: number;
  name: string;
  status: string;
  fishing_locked: boolean;
  chug_locked: boolean;
  golf_locked: boolean;
}

export interface Kak {
  id: string;
  name: string;
  status: string;
}

export interface Team {
  id: string;
  yearId: string;
  name: string;
  position: number;
  kak1: string | null;
  kak2: string | null;
  kak3: string | null;
  kak4: string | null;
  kak1Id: string | null;
  kak2Id: string | null;
  kak3Id: string | null;
  kak4Id: string | null;
  locked: boolean;
}
