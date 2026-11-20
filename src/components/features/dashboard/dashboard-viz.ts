// Chart palette + data shape, kept apart from the recharts components so pages can use them without
// pulling recharts into their initial bundle. Palette validated for colour-blind separation.
export const VIZ = { blue: "#7fa9ee", teal: "#306fdb", amber: "#e08a1e", grid: "#e8ecf1", axis: "#64748b" };

export interface TrendPoint {
  day: string; date: string; appointments: number; sessions: number; revenue: number; newPatients: number;
}
