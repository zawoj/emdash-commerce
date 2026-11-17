// What a tab does (closed vocabulary): follow its link, open the menu drawer or the search overlay (the
// header's own controls, found by their data attributes) or open the mini-cart (a link without script).
export const tabBarActions = {
  link: 'link',
  drawer: 'drawer',
  search: 'search',
  miniCart: 'mini-cart',
} as const
export type TabBarAction = (typeof tabBarActions)[keyof typeof tabBarActions]

export const tabBarIcons = {
  home: 'home',
  categories: 'categories',
  search: 'search',
  cart: 'cart',
  account: 'account',
} as const
export type TabBarIcon = (typeof tabBarIcons)[keyof typeof tabBarIcons]
