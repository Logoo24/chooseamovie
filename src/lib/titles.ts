export type TitleType = "movie" | "show";

export type Title = {
  id: string;
  name: string;
  year?: number;
  type: TitleType;
  mpaa?: "G" | "PG" | "PG-13" | "R";
  genres: string[];
  runtimeMins?: number;
};

export const TITLES: Title[] = [
  { id: "tt1", name: "Back to the Future", year: 1985, type: "movie", mpaa: "PG", genres: ["Adventure", "Comedy"], runtimeMins: 116 },
  { id: "tt2", name: "The Princess Bride", year: 1987, type: "movie", mpaa: "PG", genres: ["Adventure", "Romance"], runtimeMins: 98 },
  { id: "tt3", name: "Spider-Man: Into the Spider-Verse", year: 2018, type: "movie", mpaa: "PG", genres: ["Animation", "Action"], runtimeMins: 117 },
  { id: "tt4", name: "The Incredibles", year: 2004, type: "movie", mpaa: "PG", genres: ["Animation", "Action"], runtimeMins: 115 },
  { id: "tt5", name: "The Truman Show", year: 1998, type: "movie", mpaa: "PG", genres: ["Drama", "Comedy"], runtimeMins: 103 },
  { id: "tt6", name: "Interstellar", year: 2014, type: "movie", mpaa: "PG-13", genres: ["Sci-Fi", "Drama"], runtimeMins: 169 },
  { id: "tt7", name: "Knives Out", year: 2019, type: "movie", mpaa: "PG-13", genres: ["Mystery", "Comedy"], runtimeMins: 130 },
  { id: "tt8", name: "The Dark Knight", year: 2008, type: "movie", mpaa: "PG-13", genres: ["Action", "Crime"], runtimeMins: 152 },
  { id: "tt9", name: "Toy Story", year: 1995, type: "movie", mpaa: "G", genres: ["Animation", "Comedy"], runtimeMins: 81 },
  { id: "tt10", name: "The Lord of the Rings: The Fellowship of the Ring", year: 2001, type: "movie", mpaa: "PG-13", genres: ["Fantasy", "Adventure"], runtimeMins: 178 },

  { id: "ts1", name: "Stranger Things", year: 2016, type: "show", mpaa: "PG-13", genres: ["Sci-Fi", "Mystery"] },
  { id: "ts2", name: "The Office", year: 2005, type: "show", mpaa: "PG", genres: ["Comedy"] },
  { id: "ts3", name: "Avatar: The Last Airbender", year: 2005, type: "show", mpaa: "PG", genres: ["Animation", "Adventure"] },
  { id: "ts4", name: "Planet Earth", year: 2006, type: "show", mpaa: "G", genres: ["Documentary"] },
];

export function titleSearchUrl(t: Title) {
  const q = encodeURIComponent(`${t.name}${t.year ? " " + t.year : ""} ${t.type === "movie" ? "movie" : "tv show"}`);
  return `https://www.google.com/search?q=${q}`;
}
