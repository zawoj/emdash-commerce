// Barrel for every public component, its variant vocabularies and prop types. Astro components
// are exported straight from here — `import { Button } from '@emdash-commerce/design-system'` — so
// consumers never import a relative path into `src/components`. Client-side scripts are package
// subpaths instead (`@emdash-commerce/design-system/balanced-clamp`), so a <script> never pulls in the
// components.

// Shared prop types
export type { DisplayDate } from './types/date'
export type { ImageAttrs } from './types/image'
export type { LinkContent } from './types/link'
export type { ImageAsset } from './types/asset'
export type { TileHeading, WidgetHeading } from './types/heading'

// Artwork drawn identically on every page
export { youtubePlayIcon } from './assets/artwork'

// Atoms

export { default as ArticleDetails } from './components/atoms/article-details/index.astro'
export { articleDetailsVariants } from './components/atoms/article-details/variants'
export type { ArticleDetailsVariant } from './components/atoms/article-details/variants'
export { default as Image } from './components/atoms/image/index.astro'
export { default as SiteWordmark } from './components/atoms/site-wordmark/index.astro'
export { default as Avatar } from './components/atoms/avatar/index.astro'
export { default as Breadcrumbs } from './components/atoms/breadcrumbs/index.astro'
export { default as Button } from './components/atoms/button/index.astro'
export { buttonVariants, buttonSizes, buttonKinds } from './components/atoms/button/variants'
export type { ButtonVariant, ButtonSize, ButtonKind } from './components/atoms/button/variants'
export { default as Byline } from './components/atoms/byline/index.astro'
export { default as CategoryLabel } from './components/atoms/category-label/index.astro'
export { categoryKeys, categoryLabelSizes } from './components/atoms/category-label/variants'
export type { CategoryKey, CategoryLabelSize } from './components/atoms/category-label/variants'
export type { CategoryRef } from './components/atoms/category-label/types'
export { categoryColor } from './utils/category-color'
export { default as CategoryPartnerBadge } from './components/atoms/category-partner-badge/index.astro'
export { default as ClearFilters } from './components/atoms/clear-filters/index.astro'
export { default as DateBadge } from './components/atoms/date-badge/index.astro'
export { dateBadgeSizes } from './components/atoms/date-badge/variants'
export type { DateBadgeSize } from './components/atoms/date-badge/variants'
export { default as Definition } from './components/atoms/definition/index.astro'
export { default as FieldInput } from './components/atoms/field-input/index.astro'
export { default as FieldTextarea } from './components/atoms/field-textarea/index.astro'
export { default as FilterLabel } from './components/atoms/filter-label/index.astro'
export { filterLabelTones } from './components/atoms/filter-label/variants'
export type { FilterLabelTone } from './components/atoms/filter-label/variants'
export { default as Icon } from './components/atoms/icon/index.astro'
export { iconNames } from './components/atoms/icon/names'
export type { IconName } from './components/atoms/icon/names'
export { default as IconButton } from './components/atoms/icon-button/index.astro'
export { default as NbspText } from './components/atoms/nbsp-text/index.astro'
export { default as Pagination } from './components/atoms/pagination/index.astro'
export { default as PaginationArrow } from './components/atoms/pagination-arrow/index.astro'
export { default as PaginationItem } from './components/atoms/pagination-item/index.astro'
export { default as ScrollButton } from './components/atoms/scroll-button/index.astro'
export { default as SearchField } from './components/atoms/search-field/index.astro'
export { searchFieldSizes } from './components/atoms/search-field/variants'
export type { SearchFieldSize } from './components/atoms/search-field/variants'
export { default as Select } from './components/atoms/select/index.astro'
export { selectSizes } from './components/atoms/select/variants'
export type { SelectSize } from './components/atoms/select/variants'
export { default as SocialLinks } from './components/atoms/social-links/index.astro'
export { socialLinksVariants } from './components/atoms/social-links/variants'
export type { SocialLinksVariant } from './components/atoms/social-links/variants'
export { default as Tag } from './components/atoms/tag/index.astro'
export { default as TocToggle } from './components/atoms/toc-toggle/index.astro'

// Molecules
export { default as SearchBar } from './components/molecules/search-bar/index.astro'
export { searchBarSizes } from './components/molecules/search-bar/variants'
export type { SearchBarSize } from './components/molecules/search-bar/variants'
export { default as TileTitle } from './components/molecules/tile-title/index.astro'
export { tileTitleSizes, tileTitleTones } from './components/molecules/tile-title/variants'
export type { TileTitleSize, TileTitleTone } from './components/molecules/tile-title/variants'

// Parts — building blocks shared by several blocks
export { default as ArticleCard } from './components/parts/article-card/index.astro'
export { articleCardVariants, articleCardSizes } from './components/parts/article-card/variants'
export type { ArticleCardVariant, ArticleCardSize } from './components/parts/article-card/variants'
export type { ArticleCardContent } from './components/parts/article-card/types'
export { default as ContentTile } from './components/parts/content-tile/index.astro'
export { tileSurfaces, tilePaddings } from './components/parts/content-tile/variants'
export type { TileSurface, TilePadding } from './components/parts/content-tile/variants'
export { default as AdInfo } from './components/parts/ad-info/index.astro'
export { adInfoLayouts } from './components/parts/ad-info/variants'
export type { AdInfoLayout } from './components/parts/ad-info/variants'
export { default as AdTile } from './components/parts/ad-tile/index.astro'
export { adTilePlacements } from './components/parts/ad-tile/variants'
export type { AdTilePlacement } from './components/parts/ad-tile/variants'
export type { AdContent, AdCreative, AdLink, AdMeasure, AdNarrowCreative } from './components/parts/ad-tile/types'
export { default as CategoryTile } from './components/parts/category-tile/index.astro'
export type { CategoryTileContent, CategoryTileLead } from './components/parts/category-tile/types'
export { default as DealCard } from './components/parts/deal-card/index.astro'
export { DEAL_MARK_HEIGHT, dealCardVariants } from './components/parts/deal-card/variants'
export type { DealCardVariant } from './components/parts/deal-card/variants'
export type { DealCardContent, DealHowTo } from './components/parts/deal-card/types'
export { default as DealGrid } from './components/parts/deal-grid/index.astro'
export type { DealGridProps, DealGridSelect } from './components/parts/deal-grid/types'
export { default as PartnerGrid } from './components/parts/partner-grid/index.astro'
export type { PartnerGridProps } from './components/parts/partner-grid/types'
export type { PartnerCardContent } from './components/parts/partner-card/types'
export { default as PartnerProfile } from './components/parts/partner-profile/index.astro'
export type { PartnerProfileProps } from './components/parts/partner-profile/types'
export { default as DiscountMessage } from './components/parts/discount-message/index.astro'
export type { DiscountMessageProps } from './components/parts/discount-message/types'
export { default as DealInfo } from './components/parts/deal-info/index.astro'
export type { DealInfoProps } from './components/parts/deal-info/types'
export { default as AuthorProfile } from './components/parts/author-profile/index.astro'
export type { AuthorProfileContent } from './components/parts/author-profile/types'
export { default as CalendarListing } from './components/parts/calendar-listing/index.astro'
export type { CalendarListingProps, CalendarListingSection, CalendarListingSelect } from './components/parts/calendar-listing/types'
export { default as EventTable } from './components/parts/event-table/index.astro'
export { eventTableVariants } from './components/parts/event-table/variants'
export type { EventTableVariant } from './components/parts/event-table/variants'
export type { EventRowContent, EventTableColumns } from './components/parts/event-table/types'
export { default as EventsFeature } from './components/parts/events-feature/index.astro'
export { eventFeatureVariants } from './components/parts/events-feature/variants'
export type { EventFeatureVariant } from './components/parts/events-feature/variants'
export type { EventFeatureContent, EventFeatureItem } from './components/parts/events-feature/types'
export { default as EventsList } from './components/parts/events-list/index.astro'
export { eventListVariants } from './components/parts/events-list/variants'
export type { EventListVariant } from './components/parts/events-list/variants'
export type { EventListContent, EventListItem } from './components/parts/events-list/types'
export { default as GlossaryLead } from './components/parts/glossary-lead/index.astro'
export { default as GlossaryList } from './components/parts/glossary-list/index.astro'
export type { GlossaryListGroup, GlossaryListProps, GlossaryListTerm } from './components/parts/glossary-list/types'
export { default as PopularWidget } from './components/parts/popular-widget/index.astro'
export { popularRowSpacings, popularWidgetLayouts } from './components/parts/popular-widget/variants'
export type { PopularRowSpacing, PopularWidgetLayout } from './components/parts/popular-widget/variants'
export type { PopularItem, PopularWidgetContent } from './components/parts/popular-widget/types'
export { default as PaginationBar } from './components/parts/pagination-bar/index.astro'
export type { PaginationBarLabels, PaginationBarProps } from './components/parts/pagination-bar/types'
export { default as PoweredBy } from './components/parts/powered-by/index.astro'
export { creditPlacements } from './components/parts/powered-by/variants'
export type { CreditPlacement } from './components/parts/powered-by/variants'
export type { PartnerCredit } from './components/parts/powered-by/types'
export { default as PageEnd } from './components/parts/page-end/index.astro'
export { default as Sitemap } from './components/parts/sitemap/index.astro'
export { default as SocialsWidget } from './components/parts/socials-widget/index.astro'
export type { SocialChannel, SocialsWidgetContent } from './components/parts/socials-widget/types'
export { default as ListingIntro } from './components/parts/listing-intro/index.astro'
export type { ListingIntroProps } from './components/parts/listing-intro/types'
export { default as TagList } from './components/parts/tag-list/index.astro'
export { default as TagsWidget } from './components/parts/tags-widget/index.astro'
export type { TagsWidgetContent } from './components/parts/tags-widget/types'
export { default as VideoCard } from './components/parts/video-card/index.astro'
export { videoCardSizes } from './components/parts/video-card/variants'
export type { VideoCardSize } from './components/parts/video-card/variants'
export type { ThumbnailCrop, VideoAuthor, VideoCardContent } from './components/parts/video-card/types'
export { default as VideoListWidget } from './components/parts/video-list-widget/index.astro'
export type { VideoListItem, VideoListWidgetContent } from './components/parts/video-list-widget/types'
export { default as VideoWidget } from './components/parts/video-widget/index.astro'
export type { VideoWidgetContent } from './components/parts/video-widget/types'
export { default as YoutubeTile } from './components/parts/youtube-tile/index.astro'
export { youtubeTileSizes } from './components/parts/youtube-tile/variants'
export type { YoutubeTileSize } from './components/parts/youtube-tile/variants'

// Blocks — one per CMS layout block
export { default as LatestPosts } from './components/blocks/sections/latest-posts/index.astro'
export { LATEST_POSTS_IMAGE_SIZES, LATEST_POSTS_LIMIT } from './components/blocks/sections/latest-posts/variants'
export type { LatestPostsProps } from './components/blocks/sections/latest-posts/types'
export { default as AuthorDates } from './components/blocks/left-bar/author-dates/index.astro'
export type { AuthorAvatar, AuthorCollaboration, AuthorDate, AuthorDatesProps, AuthorIdentity, AvatarCrop } from './components/blocks/left-bar/author-dates/types'
export { default as CategoryPartner } from './components/blocks/left-bar/category-partner/index.astro'
export type { CategoryPartnerProps } from './components/blocks/left-bar/category-partner/types'
export { default as EventDetails } from './components/blocks/left-bar/event-details/index.astro'
export { eventDetailsVariants } from './components/blocks/left-bar/event-details/variants'
export type { EventDetailsVariant } from './components/blocks/left-bar/event-details/variants'
export type { EventDetailsFact, EventDetailsProps } from './components/blocks/left-bar/event-details/types'
export { default as TableOfContents } from './components/blocks/left-bar/table-of-contents/index.astro'
export type { TableOfContentsEntry, TableOfContentsProps } from './components/blocks/left-bar/table-of-contents/types'
export { default as PageTitle } from './components/blocks/heroes/page-title/index.astro'
export type { PageTitleProps } from './components/blocks/heroes/page-title/types'
export { default as HeroBand } from './components/blocks/heroes/hero-band/index.astro'
export { heroBandDescriptionWeights, heroBandVariants } from './components/blocks/heroes/hero-band/variants'
export type { HeroBandDescriptionWeight, HeroBandVariant } from './components/blocks/heroes/hero-band/variants'
export type { HeroBandPartner, HeroBandProps } from './components/blocks/heroes/hero-band/types'
export { default as HeroContent } from './components/blocks/heroes/hero-content/index.astro'
export type { HeroContentByline, HeroContentFigure, HeroContentProps } from './components/blocks/heroes/hero-content/types'
export { default as DiscountBanner } from './components/blocks/heroes/discount-banner/index.astro'
export type { DiscountBannerProps } from './components/blocks/heroes/discount-banner/types'
export { default as HeroHome } from './components/blocks/heroes/hero-home/index.astro'
export type { HeroHomeHot, HeroHomeProps, HeroHomeSlide } from './components/blocks/heroes/hero-home/types'
export {
  HERO_HOME_HOT_AUTHOR_CARDS,
  HERO_HOME_HOT_IMAGE_SIZES,
  HERO_HOME_HOT_LIMIT,
  HERO_HOME_SLIDE_IMAGE_SIZES,
  HERO_HOME_SLIDES_LIMIT,
} from './components/blocks/heroes/hero-home/variants'
export { default as CategoryFeature } from './components/blocks/sections/category-feature/index.astro'
export {
  CATEGORY_FEATURE_ITEM_COUNT,
  CATEGORY_FEATURE_ITEM_IMAGE_SIZES,
  CATEGORY_FEATURE_LEAD_COUNT,
  CATEGORY_FEATURE_LEAD_IMAGE_SIZES,
} from './components/blocks/sections/category-feature/variants'
export type { CategoryFeatureProps } from './components/blocks/sections/category-feature/types'
export { default as CategoryGrid } from './components/blocks/sections/category-grid/index.astro'
export { CATEGORY_GRID_IMAGE_SIZES, CATEGORY_GRID_ITEM_COUNT } from './components/blocks/sections/category-grid/variants'
export type { CategoryGridProps } from './components/blocks/sections/category-grid/types'
export { default as CategoryDarkTile } from './components/blocks/sections/category-dark-tile/index.astro'
export {
  CATEGORY_DARK_TILE_FEATURE_COUNT,
  CATEGORY_DARK_TILE_FEATURE_IMAGE_SIZES,
  CATEGORY_DARK_TILE_ITEM_COUNT,
  CATEGORY_DARK_TILE_ITEM_IMAGE_SIZES,
} from './components/blocks/sections/category-dark-tile/variants'
export type { CategoryDarkTileProps } from './components/blocks/sections/category-dark-tile/types'
export { default as CategoryPair } from './components/blocks/sections/category-pair/index.astro'
export {
  CATEGORY_PAIR_LEAD_COUNT,
  CATEGORY_PAIR_LEAD_IMAGE_SIZES,
  CATEGORY_PAIR_LIST_COUNT,
  CATEGORY_PAIR_LIST_IMAGE_SIZES,
} from './components/blocks/sections/category-pair/variants'
export type { CategoryPairProps } from './components/blocks/sections/category-pair/types'
export { default as TagPosts } from './components/blocks/sections/tag-posts/index.astro'
export { TAG_POSTS_ITEM_COUNT } from './components/blocks/sections/tag-posts/variants'
export type { TagPostsProps } from './components/blocks/sections/tag-posts/types'
export { default as FeaturedPost } from './components/blocks/sections/featured-post/index.astro'
export { FEATURED_POST_IMAGE_SIZES } from './components/blocks/sections/featured-post/variants'
export type { FeaturedPostProps } from './components/blocks/sections/featured-post/types'
export { default as RelatedPosts } from './components/blocks/sections/related-posts/index.astro'
export { RELATED_POSTS_IMAGE_SIZES, RELATED_POSTS_ITEM_COUNT } from './components/blocks/sections/related-posts/variants'
export type { RelatedPostsProps } from './components/blocks/sections/related-posts/types'
export { default as PostList } from './components/blocks/sections/post-list/index.astro'
export {
  POST_LIST_FIELDS,
  POST_LIST_IMAGE_SIZES,
  POST_LIST_PAGE_SIZE,
  postListPaginationTones,
  postListRhythms,
  postListSearchSizes,
} from './components/blocks/sections/post-list/variants'
export type {
  PostListPaginationTone,
  PostListRhythm,
  PostListSearchSize,
} from './components/blocks/sections/post-list/variants'
export type { PostListGroup, PostListOption, PostListPagination, PostListProps, PostListSearch } from './components/blocks/sections/post-list/types'
export { default as StartLine } from './components/blocks/sections/start-line/index.astro'
export { START_LINE_EVENTS, START_LINE_WINDOW_DAYS } from './components/blocks/sections/start-line/variants'
export type { StartLineProps } from './components/blocks/sections/start-line/types'
export { default as UpcomingEvents } from './components/blocks/widgets/upcoming-events/index.astro'
export { UPCOMING_EVENTS_LIMITS, upcomingEventsVariants } from './components/blocks/widgets/upcoming-events/variants'
export type { UpcomingEventsVariant } from './components/blocks/widgets/upcoming-events/variants'
export type { UpcomingEventsProps } from './components/blocks/widgets/upcoming-events/types'
export { default as Discounts } from './components/blocks/widgets/discounts/index.astro'
export { DISCOUNTS_LIMITS, discountsVariants } from './components/blocks/widgets/discounts/variants'
export type { DiscountsVariant } from './components/blocks/widgets/discounts/variants'
export type { DiscountsProps } from './components/blocks/widgets/discounts/types'
export { default as StrategicPartners } from './components/blocks/sections/strategic-partners/index.astro'
export type { StrategicPartnerLogo, StrategicPartnersProps } from './components/blocks/sections/strategic-partners/types'
export { default as RelatedRecords } from './components/blocks/sections/related-records/index.astro'
export type { RelatedRecordsProps } from './components/blocks/sections/related-records/types'
export { default as DiscountHowTo } from './components/blocks/left-bar/discount-how-to/index.astro'
export type { DiscountHowToProps } from './components/blocks/left-bar/discount-how-to/types'
export { default as PopularPosts } from './components/blocks/widgets/popular-posts/index.astro'
export { popularPostsLooks } from './components/blocks/widgets/popular-posts/variants'
export type { PopularPostsLook } from './components/blocks/widgets/popular-posts/variants'
export type { PopularPostsProps } from './components/blocks/widgets/popular-posts/types'
export { default as YoutubeVideos } from './components/blocks/widgets/youtube-videos/index.astro'
export { youtubeVideosLooks } from './components/blocks/widgets/youtube-videos/variants'
export type { YoutubeVideosLook } from './components/blocks/widgets/youtube-videos/variants'
export type { YoutubeVideosProps } from './components/blocks/widgets/youtube-videos/types'
export { default as Ad } from './components/blocks/widgets/ad/index.astro'
export { AD_IMAGE_SIZES, AD_SLOT_CAPTION_ALLOWANCE, AD_SLOT_WIDTHS } from './components/blocks/widgets/ad/variants'
export type { AdCampaign, AdProps } from './components/blocks/widgets/ad/types'
export { default as Socials } from './components/blocks/widgets/socials/index.astro'
export { socialChannelKeys } from './components/blocks/widgets/socials/variants'
export type { SocialChannelKey } from './components/blocks/widgets/socials/variants'
export type { SocialsChannel, SocialsProps } from './components/blocks/widgets/socials/types'
export { default as ContactDetails } from './components/blocks/sections/contact-details/index.astro'
export type { ContactDetailsProps } from './components/blocks/sections/contact-details/types'
export { default as Newsletter } from './components/blocks/sections/newsletter/index.astro'
export type { NewsletterProps } from './components/blocks/sections/newsletter/types'

// Chrome — the header, the footer and the partner strip every page renders
export { default as PageGrid } from './components/chrome/page-grid/index.astro'
export { pageGridLeftOrders, pageGridVariants } from './components/chrome/page-grid/variants'
export type { PageGridLeftOrder, PageGridVariant } from './components/chrome/page-grid/variants'
export { default as TabBar } from './components/chrome/tab-bar/index.astro'
export { tabBarActions, tabBarIcons } from './components/chrome/tab-bar/variants'
export type { TabBarAction, TabBarIcon } from './components/chrome/tab-bar/variants'
export type { TabBarItem, TabBarProps } from './components/chrome/tab-bar/types'
export { default as ActionBar } from './components/chrome/action-bar/index.astro'
export type { ActionBarMirror, ActionBarProps } from './components/chrome/action-bar/types'
export { default as SkipLink } from './components/chrome/skip-link/index.astro'
export { default as SiteHeader } from './components/chrome/site-header/index.astro'
export { default as MobileMenuDrawer } from './components/chrome/site-header/mobile-drawer.astro'
export { default as SiteSearchPanel } from './components/chrome/site-header/search-panel.astro'
export { default as SiteFooter } from './components/chrome/site-footer/index.astro'
export { footerVariants } from './components/chrome/site-footer/variants'
export type { FooterVariant } from './components/chrome/site-footer/variants'
export { default as LocaleSwitcher } from './components/chrome/locale-switcher/index.astro'
export type { LocaleOption, LocaleSwitcherProps } from './components/chrome/locale-switcher/types'
export { default as PartnerStrip } from './components/chrome/partner-strip/index.astro'
export { partnerStripPlacements } from './components/chrome/partner-strip/variants'
export type { PartnerStripPlacement } from './components/chrome/partner-strip/variants'
export type {
  ChromeLink,
  ChromeMenuFeatured,
  ChromeMenuGroup,
  ChromeMenuItem,
  FooterColumn,
  FooterProject,
  FooterSocial,
  HeaderAccount,
  HeaderCart,
  HeaderCategoryBar,
  HeaderCategoryLink,
  HeaderDrawerCopy,
  PartnerLogo,
  SiteSearch,
  SiteSearchCopy,
  SiteSearchResult,
} from './components/chrome/types'

// Prose: the text of an article or a plain page and the pieces an editor drops into it
export { default as Prose } from './components/parts/prose/text.astro'
export { default as ProseCta } from './components/parts/prose/cta.astro'
export { default as ProseEmbed } from './components/parts/prose/embed.astro'
export { default as ProseFigure } from './components/parts/prose/figure.astro'
export { proseFigureSizes } from './components/parts/prose/variants'
export type { ProseFigureSize } from './components/parts/prose/variants'
export { default as ProseGallery } from './components/parts/prose/gallery.astro'
export { default as ProseLinkCard } from './components/parts/prose/link-card.astro'
export { default as ProseQuote } from './components/parts/prose/quote.astro'
export { default as ProseTable } from './components/parts/prose/table.astro'
export { default as ProseWidget } from './components/parts/prose/widget.astro'
export type { ProseGalleryImage, ProseTableRow } from './components/parts/prose/types'

// Form: the tile, the row of fields and the controls of a form
export { default as FormTile } from './components/parts/form/tile.astro'
export { default as FormFields } from './components/parts/form/fields.astro'
export { default as FormField } from './components/parts/form/field.astro'
export { default as FieldCheckbox } from './components/atoms/field-checkbox/index.astro'
export { default as FieldFile } from './components/atoms/field-file/index.astro'
export { default as FieldRadioGroup } from './components/atoms/field-radio-group/index.astro'
export type { FieldRadioOption } from './components/atoms/field-radio-group/index.astro'
export { default as FieldSelect } from './components/atoms/field-select/index.astro'
export type { FieldSelectOption } from './components/atoms/field-select/index.astro'

// Cookie consent bar
export { default as CookieBanner } from './components/chrome/cookie-banner/index.astro'
export type { CookieBannerCategory } from './components/chrome/cookie-banner/types'

// The page of an address with nothing on it
export { default as StatusPage } from './components/parts/status-page/index.astro'

// Starters: the page sections and the shop pieces of the `basic`, `ecommerce` and `marketplace` apps
export { default as PageMain } from './components/chrome/page-main/index.astro'
export { default as CardGrid } from './components/parts/card-grid/index.astro'
export type { CardGridProps } from './components/parts/card-grid/types'
export { default as PageHero } from './components/blocks/heroes/page-hero/index.astro'
export { pageHeroAlignments, pageHeroTones } from './components/blocks/heroes/page-hero/variants'
export type { PageHeroAlignment, PageHeroTone } from './components/blocks/heroes/page-hero/variants'
export type { PageHeroProps } from './components/blocks/heroes/page-hero/types'
export { default as PageContent } from './components/blocks/sections/page-content/index.astro'
export { pageContentWidths } from './components/blocks/sections/page-content/variants'
export type { PageContentWidth } from './components/blocks/sections/page-content/variants'
export type { PageContentProps } from './components/blocks/sections/page-content/types'
export { default as Contact } from './components/blocks/sections/contact/index.astro'
export type { ContactHour, ContactProps } from './components/blocks/sections/contact/types'
export { default as ImageBlock } from './components/blocks/sections/image/index.astro'
export { imageBlockSizes } from './components/blocks/sections/image/variants'
export type { ImageBlockSize } from './components/blocks/sections/image/variants'
export type { ImageBlockProps } from './components/blocks/sections/image/types'
export { default as Price } from './components/atoms/price/index.astro'
export { priceSizes } from './components/atoms/price/variants'
export type { PriceSize } from './components/atoms/price/variants'
export { default as Availability } from './components/atoms/availability/index.astro'
export { default as ProductCard } from './components/parts/product-card/index.astro'
export type { ProductCardContent } from './components/parts/product-card/types'
export { default as ProductDetail } from './components/parts/product-detail/index.astro'
export type { ProductDetailProps } from './components/parts/product-detail/types'

// Commerce — the storefront's atoms, molecules, parts and sections (cart, checkout, account, listing)
export { default as OptionChip } from './components/atoms/option-chip/index.astro'
export type { OptionChipContent, OptionChipProps } from './components/atoms/option-chip/types'
export { default as QuantityStepper } from './components/atoms/quantity-stepper/index.astro'
export type { QuantityStepperProps } from './components/atoms/quantity-stepper/types'
export { default as InlineNotice } from './components/atoms/inline-notice/index.astro'
export { noticeTones } from './components/atoms/inline-notice/variants'
export type { NoticeTone } from './components/atoms/inline-notice/variants'
export type { InlineNoticeProps } from './components/atoms/inline-notice/types'
export { default as StatusBadge } from './components/atoms/status-badge/index.astro'
export { statusTones } from './components/atoms/status-badge/variants'
export type { StatusTone } from './components/atoms/status-badge/variants'
export type { StatusBadgeProps } from './components/atoms/status-badge/types'
export { default as CountBadge } from './components/atoms/count-badge/index.astro'
export type { CountBadgeProps } from './components/atoms/count-badge/types'
export type { PriceCompareAt } from './components/atoms/price/types'

export { default as Disclosure } from './components/molecules/disclosure/index.astro'
export type { DisclosureProps } from './components/molecules/disclosure/types'
export { default as Tabs } from './components/molecules/tabs/index.astro'
export type { TabItem, TabsProps } from './components/molecules/tabs/types'
export { default as ToggleSection } from './components/molecules/toggle-section/index.astro'
export type { ToggleSectionProps } from './components/molecules/toggle-section/types'
export { default as AddressCard } from './components/molecules/address-card/index.astro'
export type { AddressCardProps } from './components/molecules/address-card/types'
export { default as Timeline } from './components/molecules/timeline/index.astro'
export { timelineStates } from './components/molecules/timeline/variants'
export type { TimelineState } from './components/molecules/timeline/variants'
export type { TimelineItem, TimelineProps } from './components/molecules/timeline/types'
export { default as AccountNav } from './components/molecules/account-nav/index.astro'
export type { AccountNavItem, AccountNavProps } from './components/molecules/account-nav/types'
export { default as PromiseList } from './components/molecules/promise-list/index.astro'
export { PROMISE_LIST_LIMIT, promiseListLayouts } from './components/molecules/promise-list/variants'
export type { PromiseListLayout } from './components/molecules/promise-list/variants'
export type { PromiseItem, PromiseListProps } from './components/molecules/promise-list/types'
export { default as FreeShippingProgress } from './components/molecules/free-shipping-progress/index.astro'
export type { FreeShippingProgressProps } from './components/molecules/free-shipping-progress/types'
export { default as CouponForm } from './components/molecules/coupon-form/index.astro'
export type { AppliedCoupon, CouponFormProps } from './components/molecules/coupon-form/types'
export { default as VariantPicker } from './components/molecules/variant-picker/index.astro'
export type { VariantAxis, VariantPickerProps } from './components/molecules/variant-picker/types'
export { default as CartLine } from './components/molecules/cart-line/index.astro'
export type {
  CartLineContent,
  CartLineNotice,
  CartLineProps,
  CartLineQuantity,
  CartLineRemove,
  CartMoney,
} from './components/molecules/cart-line/types'

export { default as ProductGallery } from './components/parts/product-gallery/index.astro'
export type { GalleryImage, ProductGalleryProps } from './components/parts/product-gallery/types'
export { default as ListingFilters } from './components/parts/listing-filters/index.astro'
export { filterGroupKinds } from './components/parts/listing-filters/variants'
export type { FilterGroupKind } from './components/parts/listing-filters/variants'
export type {
  ActiveFilter,
  CheckboxFilterGroup,
  ChipsFilterGroup,
  FilterGroup,
  FilterOption,
  ListingFiltersProps,
  RangeBound,
  RangeFilterGroup,
} from './components/parts/listing-filters/types'
export { default as ListingToolbar } from './components/parts/listing-toolbar/index.astro'
export type { ListingSort, ListingToolbarProps } from './components/parts/listing-toolbar/types'
export { default as SpecTable } from './components/parts/spec-table/index.astro'
export type { SpecRow, SpecTableProps } from './components/parts/spec-table/types'
export { default as MiniCart } from './components/parts/mini-cart/index.astro'
export type { MiniCartProps } from './components/parts/mini-cart/types'
export { default as CartLines } from './components/parts/cart-lines/index.astro'
export type { CartLinesColumnLabels, CartLinesProps } from './components/parts/cart-lines/types'
export { default as OrderSummary } from './components/parts/order-summary/index.astro'
export type { OrderSummaryProps, SummaryLine, SummaryRow } from './components/parts/order-summary/types'
export { default as CheckoutLayout } from './components/parts/checkout-layout/index.astro'
export type { CheckoutLayoutProps } from './components/parts/checkout-layout/types'
export { default as CheckoutSteps } from './components/parts/checkout-steps/index.astro'
export { checkoutStepStates } from './components/parts/checkout-steps/variants'
export type { CheckoutStepState } from './components/parts/checkout-steps/variants'
export type { CheckoutStep, CheckoutStepsProps } from './components/parts/checkout-steps/types'
export { default as AddressForm } from './components/parts/address-form/index.astro'
export { addressFieldKeys, addressFieldOrder } from './components/parts/address-form/variants'
export type { AddressFieldKey } from './components/parts/address-form/variants'
export type { AddressFieldContent, AddressFormProps } from './components/parts/address-form/types'
export { default as ChoiceList } from './components/parts/choice-list/index.astro'
export type { ChoiceListProps, ChoiceOption } from './components/parts/choice-list/types'
export { default as PickupPointPicker } from './components/parts/pickup-point-picker/index.astro'
export type {
  PickupPointContent,
  PickupPointFieldNames,
  PickupPointGeowidget,
  PickupPointPickerLabels,
  PickupPointPickerProps,
} from './components/parts/pickup-point-picker/types'
export { default as OrderList } from './components/parts/order-list/index.astro'
export type { OrderListItem, OrderListProps, OrderStatus } from './components/parts/order-list/types'
export { default as EmptyState } from './components/parts/empty-state/index.astro'
export type { EmptyStateProps } from './components/parts/empty-state/types'

export { default as ProductGrid } from './components/blocks/sections/product-grid/index.astro'
export { PRODUCT_GRID_LIMIT } from './components/blocks/sections/product-grid/variants'
export type { ProductGridProps } from './components/blocks/sections/product-grid/types'
export { default as FeaturedCategories } from './components/blocks/sections/featured-categories/index.astro'
export type { FeaturedCategoriesProps, FeaturedCategory } from './components/blocks/sections/featured-categories/types'
export { default as Faq } from './components/blocks/sections/faq/index.astro'
export type { FaqHelp, FaqItem, FaqProps } from './components/blocks/sections/faq/types'
export { default as Banner } from './components/blocks/sections/banner/index.astro'
export type { BannerProps, BannerSlotAttrs } from './components/blocks/sections/banner/types'
export { default as BrandMarquee } from './components/blocks/sections/brand-marquee/index.astro'
export { brandMarqueeTones } from './components/blocks/sections/brand-marquee/variants'
export type { BrandMarqueeProps } from './components/blocks/sections/brand-marquee/types'
export type { BrandMarqueeTone } from './components/blocks/sections/brand-marquee/variants'

export { default as RatingStars } from './components/atoms/rating-stars/index.astro'
export { RATING_STARS_MAX, ratingStarsSizes } from './components/atoms/rating-stars/variants'
export type { RatingStarsSize } from './components/atoms/rating-stars/variants'
export type { RatingStarsProps } from './components/atoms/rating-stars/types'
export { default as ReviewSummary } from './components/parts/review-summary/index.astro'
export type { ReviewHistogramRow, ReviewSummaryProps } from './components/parts/review-summary/types'
export { default as ReviewList } from './components/parts/review-list/index.astro'
export type { ReviewItem, ReviewListProps, ReviewSortOption } from './components/parts/review-list/types'
export { default as ReviewForm } from './components/parts/review-form/index.astro'
export type { ReviewFormErrors, ReviewFormProps, ReviewFormValues } from './components/parts/review-form/types'

// Homepage section library (store variants)
export { default as BoardHero } from './components/blocks/sections/board-hero/index.astro'
export type { BoardHeroProduct, BoardHeroProps } from './components/blocks/sections/board-hero/types'
export { default as ProductRail } from './components/blocks/sections/product-rail/index.astro'
export type { ProductRailProps, ProductRailTab } from './components/blocks/sections/product-rail/types'
export { default as ProductSpotlight } from './components/blocks/sections/product-spotlight/index.astro'
export type { ProductSpotlightProps, SpotlightCallout, SpotlightSpec } from './components/blocks/sections/product-spotlight/types'
export { calloutSides, type CalloutSide } from './components/blocks/sections/product-spotlight/variants'
export { default as ActivityIndex } from './components/blocks/sections/activity-index/index.astro'
export type { ActivityIndexItem, ActivityIndexProps } from './components/blocks/sections/activity-index/types'
export { default as CollectionBento } from './components/blocks/sections/collection-bento/index.astro'
export type { CollectionBentoProps, CollectionPhotoTile, CollectionTextTile, CollectionTile } from './components/blocks/sections/collection-bento/types'
export { collectionTileTones, type CollectionTileTone } from './components/blocks/sections/collection-bento/variants'
export { default as ShopTheLook } from './components/blocks/sections/shop-the-look/index.astro'
export type { ShopTheLookItem, ShopTheLookProps } from './components/blocks/sections/shop-the-look/types'
export { default as TurnstileSlot } from './components/parts/turnstile-slot/index.astro'
export type { TurnstileSlotProps } from './components/parts/turnstile-slot/types'
export { default as LookDialog } from './components/parts/look-dialog/index.astro'
export type { LookDialogCopy, LookDialogMoney, LookDialogProps, LookPrice, LookProductChoice, LookVariant } from './components/parts/look-dialog/types'
export { default as StorySplit } from './components/blocks/sections/story-split/index.astro'
export type { StoryChapter, StorySplitProps } from './components/blocks/sections/story-split/types'
export { storySplitSides, type StorySplitSide } from './components/blocks/sections/story-split/variants'
export { default as ReviewWall } from './components/blocks/sections/review-wall/index.astro'
export type { ReviewWallProps, ReviewWallReview } from './components/blocks/sections/review-wall/types'
export { default as AuthShell } from './components/parts/auth-shell/index.astro'
export type { AuthBenefit, AuthBrand, AuthShellProps } from './components/parts/auth-shell/types'
export { default as AuthState } from './components/parts/auth-shell/state.astro'
export { authStateTones, type AuthStateTone } from './components/parts/auth-shell/types'

// Account, orders and returns (dashboard rework)
export { default as ThumbStack } from './components/molecules/thumb-stack/index.astro'
export type { ThumbStackProps } from './components/molecules/thumb-stack/types'
export { default as OrderProgress } from './components/parts/order-progress/index.astro'
export type { OrderProgressProps, OrderProgressStep } from './components/parts/order-progress/types'
export { default as OrderCard } from './components/parts/order-card/index.astro'
export type { OrderCardAction, OrderCardProps } from './components/parts/order-card/types'
export { default as AccountLinks } from './components/parts/account-links/index.astro'
export type { AccountLink, AccountLinksProps } from './components/parts/account-links/types'
export { default as ReturnList } from './components/parts/return-list/index.astro'
export type { ReturnListItem, ReturnListProps } from './components/parts/return-list/types'
export { default as ReturnRequest } from './components/parts/return-request/index.astro'
export type { ReturnRequestLabels, ReturnRequestLine, ReturnRequestProps } from './components/parts/return-request/types'

// Checkout, cart and error pages (flows polish)
export { default as SecureNote } from './components/molecules/secure-note/index.astro'
export type { SecureNoteProps } from './components/molecules/secure-note/types'
export type { StatusPageProps, StatusPageSearch } from './components/parts/status-page/types'
export type { CheckoutSummaryToggle } from './components/parts/checkout-layout/types'
export { default as CheckoutRecap } from './components/parts/checkout-recap/index.astro'
export type { CheckoutRecapProps, CheckoutRecapSection } from './components/parts/checkout-recap/types'
export { default as OrderConfirmation } from './components/parts/order-confirmation/index.astro'
export type { OrderConfirmationFact, OrderConfirmationProps, OrderConfirmationStep } from './components/parts/order-confirmation/types'
export { orderConfirmationTones, type OrderConfirmationTone } from './components/parts/order-confirmation/types'
export { default as ProductDetails } from './components/parts/product-details/index.astro'
export { productDetailsTabs } from './components/parts/product-details/types'
export type { ProductDetailsPanel, ProductDetailsProps, ProductDetailsTab } from './components/parts/product-details/types'
