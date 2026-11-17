// The layout of "Filmy YouTube": `grid` = the main-column tile with a row of video cards (Figma
// 944:29442 "najnowsze filmy"), `single` = the sidebar tile with one wide card (931:31892 "polecany
// film"), `list` = the sidebar list of small rows (X_old_widget-R-polecane-filmy "Polecane filmy").
export const youtubeVideosLooks = {
  grid: 'grid',
  single: 'single',
  list: 'list',
} as const
export type YoutubeVideosLook = (typeof youtubeVideosLooks)[keyof typeof youtubeVideosLooks]
