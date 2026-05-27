import { Config } from '../Config'
import { EVT } from '../EVT'
import { lang } from '../Language'
import { LangTextKey } from '../langText'
import { msgBox } from '../MsgBox'
import { store } from '../store/Store'
import { Utils } from '../utils/Utils'
import { downloadStates } from '../download/DownloadStates'
import { optionConfigs } from './OptionConfigs'
import { OptionCategoryLevel1, settings, setSetting } from './Settings'
import { SettingsForm } from './SettingsForm'

type PageId = 'home' | OptionCategoryLevel1 | 'help' | 'search'
type PersistedPageId = 'home' | OptionCategoryLevel1

type FoldableSection = {
  page: PageId
  id: string
  persisted: boolean
  stickyEligible: boolean
  root: HTMLDivElement
  header: HTMLButtonElement
  content: HTMLDivElement
  title: HTMLSpanElement
  iconUse?: SVGUseElement
}

type SearchMatch = {
  matchedByName: boolean
}

type DownloadSummaryState = 'start' | 'loading' | 'pause' | 'stop' | 'complete'

const pageIds: PageId[] = [
  'home',
  'crawl',
  'naming',
  'download',
  'enhance',
  'general',
  'help',
  'search',
]

class SettingsPanel {
  constructor(form: SettingsForm) {
    this.form = form
    this.centerPanel = document.querySelector(
      '.centerWrap.settingsV2'
    ) as HTMLDivElement
    this.main = this.centerPanel.querySelector(
      '.settingsPanel_main'
    ) as HTMLDivElement

    if (!this.centerPanel || !this.main) {
      throw new Error('SettingsPanel shell not found')
    }

    for (const option of this.form.querySelectorAll('.option')) {
      const no = Number.parseInt((option as HTMLElement).dataset.no || '-1')
      if (no > -1) {
        this.optionElements.set(no, option as HTMLElement)
      }
    }

    this.cacheShellElements()
    this.buildLayout()
    this.bindEvents()
    this.renderHelpActionVisibility()
    this.switchPage('home')
    this.updateSearchResult()
    this.updateDownloadSummary()
  }

  private form: SettingsForm
  private centerPanel: HTMLDivElement
  private main: HTMLDivElement

  private activePage: PageId = 'home'
  private lastNonSearchPage: Exclude<PageId, 'search'> = 'home'
  private searchKeyword = ''
  private readonly searchState = new Map<string, boolean>()

  private readonly optionElements = new Map<number, HTMLElement>()
  private readonly canonicalContainers = new Map<string, HTMLDivElement>()
  private readonly pageEls = new Map<PageId, HTMLDivElement>()
  private readonly pageInners = new Map<PageId, HTMLDivElement>()
  private readonly stickyEls = new Map<PageId, HTMLButtonElement>()
  private readonly navEls = new Map<PageId, HTMLButtonElement>()
  private readonly foldableSections = new Map<string, FoldableSection>()
  private readonly searchSections = new Map<string, FoldableSection>()
  private readonly helpActionEls = new Map<string, HTMLButtonElement>()

  private searchInput!: HTMLInputElement
  private clearSearchBtn!: HTMLButtonElement
  private expandAllBtn!: HTMLButtonElement
  private searchNavBtn!: HTMLButtonElement
  private homePinnedContent!: HTMLDivElement
  private searchSummary!: HTMLParagraphElement
  private searchGroupsWrap!: HTMLDivElement
  private summaryWrap!: HTMLDivElement
  private summaryStateSVG!: SVGSVGElement
  private summaryProgress!: HTMLSpanElement
  private summaryStateIconUse!: SVGUseElement
  private helpActionsWrap!: HTMLDivElement
  private otherBtnsVisibilityObserver?: MutationObserver
  private downloadSummaryState: DownloadSummaryState = 'start'
  private debouncedSearch = Utils.debounce(() => this.updateSearchResult(), 200)

  private cacheShellElements() {
    this.searchInput = this.centerPanel.querySelector(
      '#settingsPanelSearchInput'
    ) as HTMLInputElement
    this.clearSearchBtn = this.centerPanel.querySelector(
      '#settingsPanelClearSearch'
    ) as HTMLButtonElement
    this.expandAllBtn = this.centerPanel.querySelector(
      '#settingsPanelToggleExpand'
    ) as HTMLButtonElement
    this.searchNavBtn = this.centerPanel.querySelector(
      '.settingsPanel_navItem[data-page="search"]'
    ) as HTMLButtonElement
    this.summaryWrap = this.centerPanel.querySelector(
      '#settingsPanelDownloadSummary'
    ) as HTMLDivElement
    this.summaryStateSVG = this.centerPanel.querySelector(
      '.settingsPanel_downloadSummaryStateIcon'
    ) as SVGSVGElement
    this.summaryProgress = this.centerPanel.querySelector(
      '.settingsPanel_downloadSummaryProgress'
    ) as HTMLSpanElement
    this.summaryStateIconUse = this.centerPanel.querySelector(
      '.settingsPanel_downloadSummaryStateIcon use'
    ) as SVGUseElement

    const navButtons = this.centerPanel.querySelectorAll(
      '.settingsPanel_navItem'
    ) as NodeListOf<HTMLButtonElement>
    navButtons.forEach((button) => {
      this.navEls.set(button.dataset.page as PageId, button)
    })
  }

  private buildLayout() {
    const crawlBtnsBlock = this.findSlotBlock('stopCrawl')
    const otherBtnsBlock = this.findSlotBlock('otherBtns')
    const downloadBtnsBlock = this.findSlotBlock('exportResult')
    const downloadArea = this.findSlot('downloadArea')
    const progressBar = this.findSlot('progressBar')

    const pagesWrap = document.createElement('div')
    pagesWrap.className = 'settingsPanel_pages'

    this.form.classList.add('settingsPanel_form')
    this.form.replaceChildren(pagesWrap)

    pageIds.forEach((page) => {
      const pageEl = document.createElement('div')
      pageEl.className = 'settingsPanel_page'
      pageEl.dataset.page = page

      const sticky = document.createElement('button')
      sticky.type = 'button'
      sticky.className = 'settingsPanel_stickyHeader'
      sticky.hidden = true
      sticky.innerHTML = `
      <span class="settingsPanel_sectionHeadMain">
        <span class="settingsPanel_sectionIconWrap hidden">
          <svg class="icon" aria-hidden="true">
            <use xlink:href=""></use>
          </svg>
        </span>
        <span class="settingsPanel_sectionTitle"></span>
      </span>
      <svg class="icon settingsPanel_sectionArrow" aria-hidden="true">
        <use xlink:href="#arrow-down-2"></use>
      </svg>
      `
      pageEl.append(sticky)

      const inner = document.createElement('div')
      inner.className = 'settingsPanel_pageInner'
      pageEl.append(inner)

      pagesWrap.append(pageEl)
      this.pageEls.set(page, pageEl)
      this.pageInners.set(page, inner)
      this.stickyEls.set(page, sticky)

      sticky.addEventListener('click', () => {
        const key = sticky.dataset.sectionKey
        if (!key) {
          return
        }
        const section =
          this.foldableSections.get(key) || this.searchSections.get(key)
        if (section) {
          this.toggleSection(section)
        }
      })
    })

    this.buildHomePage(
      crawlBtnsBlock,
      otherBtnsBlock,
      downloadBtnsBlock,
      downloadArea,
      progressBar
    )
    this.buildCategoryPages()
    this.buildHelpPage()
    this.buildSearchPage()

    for (const option of this.optionElements.values()) {
      option.classList.add('settingsPanel_optionCard')
    }

    lang.register(pagesWrap)
  }

  private buildHomePage(
    crawlBtnsBlock: HTMLDivElement,
    otherBtnsBlock: HTMLDivElement,
    downloadBtnsBlock: HTMLDivElement,
    downloadArea: HTMLElement,
    progressBar: HTMLElement
  ) {
    const home = this.pageInners.get('home')!

    const homeTipsWrap = document.createElement('div')
    homeTipsWrap.className = 'settingsPanel_helpTips settingsPanel_homeTips'
    homeTipsWrap.innerHTML = `
    <div class="settingsPanel_tipCard" id="tipCloseAskFileSaveLocation">
      <svg class="icon settingsPanel_tipIcon" aria-hidden="true"><use xlink:href="#light-line"></use></svg>
      <div class="settingsPanel_tipText">
        <span class="settingsPanel_tipTextContent">
          <span data-xztext="_建议您关闭询问文件保存位置"></span>
          <button class="settingsPanel_tipConfirm" type="button" data-xztitle="_已确认">
            <svg class="icon" aria-hidden="true"><use xlink:href="#yes"></use></svg>
          </button>
        </span>
      </div>
    </div>
    `
    home.append(homeTipsWrap)

    const pinnedSection = this.createSection({
      page: 'home',
      id: 'pinnedOptions',
      titleKey: '_置顶的设置',
      iconId: 'pin-line',
      persisted: true,
      stickyEligible: true,
      type: 'title',
    })
    home.append(pinnedSection.root)
    this.homePinnedContent = pinnedSection.content

    const crawlBlock = this.createSection({
      page: 'home',
      id: 'crawlBtns',
      titleKey: '_开始抓取',
      iconId: 'rocket',
      persisted: true,
      stickyEligible: false,
      type: 'panel',
    })
    crawlBlock.content.append(crawlBtnsBlock)
    home.append(crawlBlock.root)

    const otherBlock = this.createSection({
      page: 'home',
      id: 'otherBtns',
      titleKey: '_附加功能',
      iconId: 'features',
      persisted: true,
      stickyEligible: false,
      type: 'panel',
    })
    otherBlock.content.append(otherBtnsBlock)
    home.append(otherBlock.root)
    this.bindHomeOtherBtnsVisibility(otherBlock, otherBtnsBlock)

    const downloadBlock = this.createSection({
      page: 'home',
      id: 'downloadArea',
      titleKey: '_下载区域',
      iconId: 'download',
      persisted: true,
      stickyEligible: false,
      type: 'panel',
    })
    const downloadContentWrap = document.createElement('div')
    downloadContentWrap.className = 'settingsPanel_downloadContentWrap'
    downloadContentWrap.append(downloadBtnsBlock, downloadArea, progressBar)
    downloadBlock.content.append(downloadContentWrap)
    home.append(downloadBlock.root)
  }

  private bindHomeOtherBtnsVisibility(
    otherBlock: FoldableSection,
    otherBtnsBlock: HTMLDivElement
  ) {
    const toggleOtherBlock = () => {
      const hasButtons = otherBtnsBlock.querySelector('button') !== null
      otherBlock.root.style.display = hasButtons ? '' : 'none'
    }

    toggleOtherBlock()

    this.otherBtnsVisibilityObserver?.disconnect()
    this.otherBtnsVisibilityObserver = new MutationObserver(() => {
      toggleOtherBlock()
    })
    this.otherBtnsVisibilityObserver.observe(otherBtnsBlock, {
      childList: true,
      subtree: true,
    })
  }

  private buildCategoryPages() {
    const allCategories = Object.keys(
      optionConfigs.categorySchema
    ) as OptionCategoryLevel1[]

    allCategories.forEach((page) => {
      const inner = this.pageInners.get(page)!
      const groups = Object.values(
        optionConfigs.categorySchema[page].level2
      ).sort((a, b) => a.order - b.order)

      groups.forEach((group) => {
        const section = this.createSection({
          page,
          id: group.id,
          titleKey: group.nameKey,
          persisted: true,
          stickyEligible: true,
          type: 'title',
        })
        inner.append(section.root)
        this.canonicalContainers.set(
          this.makeCanonicalKey(page, group.id),
          section.content
        )
      })
    })
  }

  private buildHelpPage() {
    const help = this.pageInners.get('help')!

    const tipsWrap = document.createElement('div')
    tipsWrap.className = 'settingsPanel_helpTips'
    tipsWrap.innerHTML = `
    <div class="settingsPanel_tipCard" id="tipPinOption">
      <svg class="icon settingsPanel_tipIcon" aria-hidden="true"><use xlink:href="#light-line"></use></svg>
      <div class="settingsPanel_tipText">
        <span class="settingsPanel_tipTextContent" data-xztext="_提示可以置顶选项"></span>
        <button class="settingsPanel_tipConfirm" type="button" data-xztitle="_已确认">
          <svg class="icon" aria-hidden="true"><use xlink:href="#yes"></use></svg>
        </button>
      </div>
    </div>
    <div class="settingsPanel_tipCard" id="tipOpenWikiLinkWrap">
      <svg class="icon settingsPanel_tipIcon" aria-hidden="true"><use xlink:href="#light-line"></use></svg>
      <div class="settingsPanel_tipText">
        <span class="settingsPanel_tipTextContent">
          <span data-xztext="_提示查看wiki页面"></span>
          <button class="settingsPanel_tipConfirm" type="button" data-xztitle="_已确认">
            <svg class="icon" aria-hidden="true"><use xlink:href="#yes"></use></svg>
          </button>
        </span>
      </div>
    </div>
    `
    help.append(tipsWrap)

    this.helpActionsWrap = document.createElement('div')
    this.helpActionsWrap.className = 'settingsPanel_helpActions'
    help.append(this.helpActionsWrap)

    const actions: {
      id: string
      textKey: LangTextKey
      iconId: string
      extraClass?: string
    }[] = [
      { id: 'wiki', textKey: '_使用手册', iconId: 'wiki' },
      { id: 'faq', textKey: '_常见问题', iconId: 'help' },
      { id: 'recentUpdates', textKey: '_最近更新', iconId: 'new-2' },
      { id: 'sponsorship', textKey: '_赞助我', iconId: 'heart-line' },
      { id: 'github', textKey: '_github', iconId: 'github' },
      { id: 'discord', textKey: '_Discord', iconId: 'discord' },
      { id: 'qq', textKey: '_QQ群', iconId: 'qq' },
      { id: 'airport', textKey: '_机场推荐', iconId: 'paper-airplane' },
      { id: 'fanbox', textKey: '_fanboxDownloader', iconId: 'box-open' },
      { id: 'thirdParty', textKey: '_第三方库', iconId: 'list' },
      { id: 'reset', textKey: '_重新显示帮助', iconId: 'reset' },
    ]

    actions.forEach((action) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'settingsPanel_helpAction hasRippleAnimation'
      button.dataset.action = action.id
      button.innerHTML = `
      <svg class="icon settingsPanel_helpActionIcon" aria-hidden="true">
        <use xlink:href="#${action.iconId}"></use>
      </svg>
      <span data-xztext="${action.textKey}"></span>
      <span class="ripple"></span>
      `
      this.helpActionsWrap.append(button)
      this.helpActionEls.set(action.id, button)
    })
  }

  private buildSearchPage() {
    const search = this.pageInners.get('search')!

    this.searchSummary = document.createElement('p')
    this.searchSummary.className = 'settingsPanel_searchSummary'
    search.append(this.searchSummary)

    this.searchGroupsWrap = document.createElement('div')
    this.searchGroupsWrap.className = 'settingsPanel_searchGroups'
    search.append(this.searchGroupsWrap)
  }

  private createSection({
    page,
    id,
    titleKey,
    iconId,
    persisted,
    stickyEligible,
    type,
  }: {
    page: PageId
    id: string
    titleKey: LangTextKey
    iconId?: string
    persisted: boolean
    stickyEligible: boolean
    type: 'title' | 'panel'
  }) {
    const root = document.createElement('div')
    root.className =
      type === 'panel'
        ? 'settingsPanel_panelSection'
        : 'settingsPanel_titleSection'

    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'settingsPanel_sectionHeader'
    root.append(header)

    const headerMain = document.createElement('span')
    headerMain.className = 'settingsPanel_sectionHeadMain'
    header.append(headerMain)

    let iconUse: SVGUseElement | undefined
    if (iconId) {
      const iconWrap = document.createElement('span')
      iconWrap.className = 'settingsPanel_sectionIconWrap'
      iconWrap.innerHTML = `
      <svg class="icon" aria-hidden="true">
        <use xlink:href="#${iconId}"></use>
      </svg>
      `
      headerMain.append(iconWrap)
      iconUse = iconWrap.querySelector('use') as SVGUseElement
    }

    const title = document.createElement('span')
    title.className = 'settingsPanel_sectionTitle'
    title.dataset.xztext = titleKey
    headerMain.append(title)

    const arrow = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    ) as SVGSVGElement
    arrow.setAttribute('class', 'icon settingsPanel_sectionArrow')
    arrow.setAttribute('aria-hidden', 'true')
    const arrowUse = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'use'
    )
    arrowUse.setAttributeNS(
      'http://www.w3.org/1999/xlink',
      'xlink:href',
      '#arrow-down-2'
    )
    arrow.append(arrowUse)
    header.append(arrow)

    const content = document.createElement('div')
    content.className =
      type === 'panel'
        ? 'settingsPanel_panelContent'
        : 'settingsPanel_titleContent'
    root.append(content)

    const section: FoldableSection = {
      page,
      id,
      persisted,
      stickyEligible,
      root,
      header,
      content,
      title,
      iconUse,
    }
    const key = this.makeSectionKey(page, id)
    this.foldableSections.set(key, section)
    header.dataset.sectionKey = key

    this.applyExpandedState(section, this.getExpandedState(section))

    header.addEventListener('click', () => this.toggleSection(section))
    header.addEventListener('keydown', (event) => {
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault()
        this.toggleSection(section)
      }
    })

    return section
  }

  private bindEvents() {
    this.navEls.forEach((button, page) => {
      button.addEventListener('click', () => {
        this.playNavRipple(button)
        this.handleNavRequest(page)
      })
      button.addEventListener('keydown', (event) => {
        if (
          (event.code === 'Enter' || event.code === 'Space') &&
          event.target === button
        ) {
          event.preventDefault()
          this.playNavRipple(button)
          this.handleNavRequest(page)
        }
      })

      if (!Config.mobile) {
        button.addEventListener('mouseenter', () => {
          if (settings.switchTabBar !== 'click') {
            this.handleNavRequest(page)
          }
        })
      }
    })

    this.searchInput.addEventListener('input', () => {
      this.debouncedSearch()
      this.updateSearchClearButton()
    })

    this.clearSearchBtn.addEventListener('click', () => {
      this.searchInput.value = ''
      this.updateSearchClearButton()
      this.updateSearchResult()
    })

    this.expandAllBtn.addEventListener('click', () => this.toggleAllSections())

    this.main.addEventListener('scroll', () => this.refreshStickyHeader())

    this.summaryWrap
      .querySelector('#settingsPanelSummaryStart')
      ?.addEventListener('click', () => this.clickRealButton('#startDownload'))
    this.summaryWrap
      .querySelector('#settingsPanelSummaryPause')
      ?.addEventListener('click', () => this.clickRealButton('#pauseDownload'))
    this.summaryWrap
      .querySelector('#settingsPanelSummaryStop')
      ?.addEventListener('click', () => this.clickRealButton('#stopDownload'))
    const summaryButtons = this.summaryWrap.querySelectorAll(
      '.settingsPanel_downloadSummaryBtn'
    ) as NodeListOf<HTMLButtonElement>
    summaryButtons.forEach((button) => {
      button.addEventListener('mouseleave', () => button.blur())
    })

    this.helpActionsWrap.addEventListener('click', (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest(
        '.settingsPanel_helpAction'
      ) as HTMLButtonElement | null
      if (!button) {
        return
      }
      this.playRipple(button)
      this.handleHelpAction(button.dataset.action || '')
    })

    window.addEventListener(EVT.list.settingChange, (ev: CustomEventInit) => {
      const data = ev.detail.data as any
      if (data.name === 'pinnedOptions') {
        this.renderCurrentPage()
      }

      if (data.name === 'expandedCards') {
        this.refreshPersistedSectionStates()
      }
    })

    window.addEventListener(EVT.list.langChange, () => {
      window.setTimeout(() => {
        this.renderHelpActionVisibility()
        this.renderCurrentPage()
        this.updateSearchResult()
        this.updateDownloadSummary()
      }, 0)
    })
    ;[
      EVT.list.crawlStart,
      EVT.list.crawlComplete,
      EVT.list.resultChange,
      EVT.list.resume,
      EVT.list.downloadStart,
      EVT.list.downloadPause,
      EVT.list.downloadStop,
      EVT.list.downloadComplete,
      EVT.list.downloadSuccess,
      EVT.list.skipDownload,
    ].forEach((eventName) => {
      window.addEventListener(eventName, () => {
        this.updateDownloadSummary()
      })
    })
    ;[
      EVT.list.crawlStart,
      EVT.list.crawlComplete,
      EVT.list.resultChange,
      EVT.list.resume,
      EVT.list.readyDownload,
      EVT.list.downloadCancel,
    ].forEach((eventName) => {
      window.addEventListener(eventName, () => {
        this.setDownloadSummaryState('start')
      })
    })
    window.addEventListener(EVT.list.downloadStart, () => {
      this.setDownloadSummaryState('loading')
    })
    window.addEventListener(EVT.list.downloadPause, () => {
      this.setDownloadSummaryState('pause')
    })
    window.addEventListener(EVT.list.downloadStop, () => {
      this.setDownloadSummaryState('stop')
    })
    window.addEventListener(EVT.list.downloadComplete, () => {
      this.setDownloadSummaryState('complete')
    })
    ;[EVT.list.crawlComplete, EVT.list.resume, EVT.list.downloadStart].forEach(
      (eventName) => {
        window.addEventListener(eventName, () => {
          this.expandHomeDownloadSection()
        })
      }
    )

    window.addEventListener(EVT.list.hasNewVer, () => {
      this.helpActionEls.get('recentUpdates')?.classList.add('hasUpdate')
    })
  }

  private handleNavRequest(page: PageId) {
    if (page === 'search' && this.searchKeyword === '') {
      return
    }

    if (this.searchKeyword !== '' && page !== 'search') {
      this.lastNonSearchPage = page as Exclude<PageId, 'search'>
      if (this.activePage === 'search') {
        this.searchInput.value = ''
        this.updateSearchClearButton()
        this.updateSearchResult()
      }
      return
    }

    this.switchPage(page)
  }

  private switchPage(page: PageId) {
    this.activePage = page
    if (page !== 'search') {
      this.lastNonSearchPage = page as Exclude<PageId, 'search'>
    }

    this.pageEls.forEach((pageEl, key) => {
      pageEl.classList.toggle('active', key === page)
    })
    this.navEls.forEach((button, key) => {
      button.classList.toggle('active', key === page)
    })

    this.renderCurrentPage()
  }

  private renderCurrentPage() {
    if (this.activePage === 'search') {
      this.renderSearchPage()
    } else {
      this.placeOptionsToDefaultContainers(this.activePage === 'home')
    }

    this.updatePinnedSectionVisibility()
    this.updateExpandAllButton()
    window.setTimeout(() => this.refreshStickyHeader(), 0)
  }

  private renderSearchPage() {
    this.searchSections.clear()
    this.searchGroupsWrap.innerHTML = ''

    const matchMap = this.findSearchMatches(this.searchKeyword)
    const groupOrder: string[] = []

    optionConfigs.options.forEach((option) => {
      const match = matchMap.get(option.no)
      if (!match) {
        return
      }

      const optionElement = this.optionElements.get(option.no)
      if (!optionElement || this.isOptionCardHidden(optionElement)) {
        return
      }

      const groupKey = this.makeSectionKey(
        'search',
        `${option.categoryLevel1}__${option.categoryLevel2}`
      )
      if (!this.searchSections.has(groupKey)) {
        const section = this.createSearchSection(
          option.categoryLevel1,
          option.categoryLevel2
        )
        this.searchSections.set(groupKey, section)
        groupOrder.push(groupKey)
        this.searchGroupsWrap.append(section.root)
      }

      this.searchSections.get(groupKey)!.content.append(optionElement)
    })

    this.placeUnmatchedOptionsBack(matchMap)
    this.updateSearchOptionHighlight(matchMap)

    if (groupOrder.length === 0) {
      this.searchSummary.dataset.xztext = '_没有找到符合条件的设置的提示'
      this.searchSummary.innerHTML =
        lang.transl('_没有找到符合条件的设置的提示')
    } else {
      this.searchSummary.innerHTML = lang.transl(
        '_找到x条与搜索词有关的设置',
        groupOrder
          .map((key) => this.searchSections.get(key)!.content.children.length)
          .reduce((total, count) => total + count, 0)
          .toString(),
        this.escapeHTML(this.searchKeyword)
      )
    }
  }

  private updateSearchResult() {
    this.searchKeyword = this.searchInput.value.trim()
    this.searchNavBtn.hidden = this.searchKeyword === ''

    if (this.searchKeyword === '') {
      this.updateSearchOptionHighlight(new Map())
      this.switchPage(this.lastNonSearchPage)
      return
    }

    this.switchPage('search')
  }

  private findSearchMatches(keyword: string) {
    const result = new Map<number, SearchMatch>()
    const lowerKeyword = keyword.toLowerCase()

    for (const option of optionConfigs.options) {
      const element = this.optionElements.get(option.no)
      if (!element || this.isOptionCardHidden(element)) {
        continue
      }

      const name = option.name.toLowerCase()
      if (name.includes(lowerKeyword)) {
        result.set(option.no, { matchedByName: true })
        continue
      }

      let matched = false
      for (const searchWord of option.searchWords) {
        const word = searchWord.toLowerCase()
        if (word.includes(lowerKeyword) || lowerKeyword.includes(word)) {
          matched = true
          break
        }
      }

      if (matched) {
        result.set(option.no, { matchedByName: false })
      }
    }

    return result
  }

  private isOptionCardHidden(option: HTMLElement) {
    return option.style.display === 'none'
  }

  private placeOptionsToDefaultContainers(showPinnedOnHome: boolean) {
    for (const option of optionConfigs.options) {
      const element = this.optionElements.get(option.no)
      if (!element) {
        continue
      }

      const target =
        showPinnedOnHome && settings.pinnedOptions.includes(option.no)
          ? this.homePinnedContent
          : this.getCanonicalContainer(
              option.categoryLevel1,
              option.categoryLevel2
            )
      target.append(element)
    }

    this.updateSearchOptionHighlight(new Map())
  }

  private placeUnmatchedOptionsBack(matchMap: Map<number, SearchMatch>) {
    for (const option of optionConfigs.options) {
      if (matchMap.has(option.no)) {
        continue
      }

      const element = this.optionElements.get(option.no)
      if (!element) {
        continue
      }
      this.getCanonicalContainer(
        option.categoryLevel1,
        option.categoryLevel2
      ).append(element)
    }
  }

  private updateSearchOptionHighlight(matchMap: Map<number, SearchMatch>) {
    optionConfigs.options.forEach((option) => {
      const element = this.optionElements.get(option.no)
      if (!element) {
        return
      }
      const target = this.findOptionNameTarget(element)
      if (!target) {
        return
      }

      const match = matchMap.get(option.no)
      if (!match || !match.matchedByName || this.searchKeyword === '') {
        lang.updateText(target, option.nameKey)
        return
      }

      delete target.dataset.xztext
      delete target.dataset.xztextargs
      target.innerHTML = this.highlightText(option.name, this.searchKeyword)
    })
  }

  private findOptionNameTarget(option: HTMLElement) {
    const direct = option.querySelector(
      '.settingNameStyle.optionName'
    ) as HTMLElement | null
    if (direct) {
      return direct
    }

    const nameLink = option.querySelector(
      '.settingNameStyle'
    ) as HTMLElement | null
    if (!nameLink) {
      return null
    }

    return (
      (nameLink.querySelector(
        '.optionName, .textTip, [data-xztext]'
      ) as HTMLElement | null) || nameLink
    )
  }

  private highlightText(text: string, keyword: string) {
    const lowerText = text.toLowerCase()
    const lowerKeyword = keyword.toLowerCase()

    if (!lowerKeyword) {
      return this.escapeHTML(text)
    }

    let cursor = 0
    let html = ''
    while (cursor < text.length) {
      const index = lowerText.indexOf(lowerKeyword, cursor)
      if (index === -1) {
        html += this.escapeHTML(text.slice(cursor))
        break
      }

      html += this.escapeHTML(text.slice(cursor, index))
      html += `<mark class="settingsPanel_searchMark">${this.escapeHTML(
        text.slice(index, index + keyword.length)
      )}</mark>`
      cursor = index + keyword.length
    }

    return html
  }

  private escapeHTML(text: string) {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  private createSearchSection(level1: OptionCategoryLevel1, level2: string) {
    const title = `${lang.transl(
      optionConfigs.categorySchema[level1].nameKey
    )} / ${lang.transl(
      optionConfigs.categorySchema[level1].level2[level2].nameKey
    )}`

    const root = document.createElement('div')
    root.className = 'settingsPanel_titleSection'

    const header = document.createElement('button')
    header.type = 'button'
    header.className = 'settingsPanel_sectionHeader'
    header.innerHTML = `
      <span class="settingsPanel_sectionHeadMain">
        <span class="settingsPanel_sectionTitle"></span>
      </span>
      <svg class="icon settingsPanel_sectionArrow" aria-hidden="true">
        <use xlink:href="#arrow-down-2"></use>
      </svg>
    `
    root.append(header)

    const content = document.createElement('div')
    content.className = 'settingsPanel_titleContent'
    root.append(content)

    const section: FoldableSection = {
      page: 'search',
      id: `${level1}__${level2}`,
      persisted: false,
      stickyEligible: true,
      root,
      header,
      content,
      title: header.querySelector(
        '.settingsPanel_sectionTitle'
      ) as HTMLSpanElement,
    }
    section.title.textContent = title

    const key = this.makeSectionKey('search', section.id)
    header.dataset.sectionKey = key

    this.applyExpandedState(section, this.searchState.get(key) ?? true)

    header.addEventListener('click', () => this.toggleSection(section))
    header.addEventListener('keydown', (event) => {
      if (event.code === 'Enter' || event.code === 'Space') {
        event.preventDefault()
        this.toggleSection(section)
      }
    })

    return section
  }

  private toggleSection(section: FoldableSection) {
    const expanded = !this.getExpandedState(section)
    this.setExpandedState(section, expanded)
    this.updateExpandAllButton()
    this.refreshStickyHeader()
  }

  private getExpandedState(section: FoldableSection) {
    if (!section.persisted) {
      return (
        this.searchState.get(this.makeSectionKey(section.page, section.id)) ??
        true
      )
    }

    const pageState = this.getPersistedPageState(
      section.page as PersistedPageId
    )
    return !!pageState?.[section.id]
  }

  private setExpandedState(section: FoldableSection, expanded: boolean) {
    if (!section.persisted) {
      this.searchState.set(
        this.makeSectionKey(section.page, section.id),
        expanded
      )
      this.applyExpandedState(section, expanded)
      return
    }

    const nextExpandedCards = Utils.deepCopy(settings.expandedCards)
    const pageState = this.getPersistedPageState(
      section.page as PersistedPageId,
      nextExpandedCards
    )
    if (pageState) {
      pageState[section.id] = expanded
    }
    setSetting('expandedCards', nextExpandedCards)
    this.applyExpandedState(section, expanded)
  }

  private applyExpandedState(section: FoldableSection, expanded: boolean) {
    section.root.classList.toggle('expanded', expanded)
    section.root.classList.toggle('collapsed', !expanded)
    section.content.style.display = expanded ? 'block' : 'none'
    section.header.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  }

  private refreshPersistedSectionStates() {
    this.foldableSections.forEach((section) => {
      this.applyExpandedState(section, this.getExpandedState(section))
    })
    this.updateExpandAllButton()
    this.refreshStickyHeader()
  }

  private toggleAllSections() {
    const shouldExpand = !this.areAllSectionsExpanded()
    const nextExpandedCards = Utils.deepCopy(settings.expandedCards)

    this.foldableSections.forEach((section) => {
      const pageState = this.getPersistedPageState(
        section.page as PersistedPageId,
        nextExpandedCards
      )
      if (pageState) {
        pageState[section.id] = shouldExpand
      }
      this.applyExpandedState(section, shouldExpand)
    })

    this.searchSections.forEach((section, key) => {
      this.searchState.set(key, shouldExpand)
      this.applyExpandedState(section, shouldExpand)
    })

    setSetting('expandedCards', nextExpandedCards)
    this.updateExpandAllButton()
    this.refreshStickyHeader()
  }

  private areAllSectionsExpanded() {
    return this.getExpandAllState() === 'expanded'
  }

  private updateExpandAllButton() {
    const state = this.getExpandAllState()
    this.expandAllBtn.classList.toggle('expanded', state === 'expanded')
    this.expandAllBtn.classList.toggle('partial', state === 'partial')
  }

  private getExpandAllState(): 'collapsed' | 'partial' | 'expanded' {
    let total = 0
    let expanded = 0

    for (const section of this.foldableSections.values()) {
      total++
      if (this.getExpandedState(section)) {
        expanded++
      }
    }

    for (const section of this.searchSections.values()) {
      total++
      if (this.getExpandedState(section)) {
        expanded++
      }
    }

    if (total === 0 || expanded === 0) {
      return 'collapsed'
    }
    if (expanded === total) {
      return 'expanded'
    }
    return 'partial'
  }

  private refreshStickyHeader() {
    const sticky = this.stickyEls.get(this.activePage)
    if (!sticky) {
      return
    }

    const sections = this.getStickySectionsForActivePage()
    if (sections.length === 0) {
      sticky.hidden = true
      return
    }

    const mainRect = this.main.getBoundingClientRect()
    let current: FoldableSection | undefined

    for (const section of sections) {
      const headerRect = section.header.getBoundingClientRect()
      const rootRect = section.root.getBoundingClientRect()
      if (
        headerRect.top <= mainRect.top &&
        rootRect.bottom > mainRect.top + headerRect.height
      ) {
        current = section
      }
    }

    if (!current) {
      sticky.hidden = true
      return
    }

    sticky.hidden = false
    sticky.dataset.sectionKey = this.makeSectionKey(current.page, current.id)

    const stickyTitle = sticky.querySelector(
      '.settingsPanel_sectionTitle'
    ) as HTMLSpanElement
    stickyTitle.textContent = current.title.textContent || ''

    const stickyIconWrap = sticky.querySelector(
      '.settingsPanel_sectionIconWrap'
    ) as HTMLSpanElement
    const stickyIconUse = sticky.querySelector('use') as SVGUseElement
    if (current.iconUse) {
      stickyIconWrap.classList.remove('hidden')
      stickyIconUse.setAttribute(
        'xlink:href',
        current.iconUse.getAttribute('xlink:href') || ''
      )
    } else {
      stickyIconWrap.classList.add('hidden')
      stickyIconUse.setAttribute('xlink:href', '')
    }
  }

  private getStickySectionsForActivePage() {
    if (this.activePage === 'search') {
      return [...this.searchSections.values()].filter(
        (section) => section.stickyEligible && this.getExpandedState(section)
      )
    }

    return [...this.foldableSections.values()].filter(
      (section) =>
        section.page === this.activePage &&
        section.stickyEligible &&
        this.getExpandedState(section)
    )
  }

  private renderHelpActionVisibility() {
    // 有些按钮只在简体中文语言里显示
    const onlyShowInZhCN = ['airport', 'qq']
    onlyShowInZhCN.forEach((id) => {
      const btn = this.helpActionEls.get(id)
      if (btn) {
        btn.style.display = lang.type === 'zh-cn' ? 'flex' : 'none'
      }
    })
  }

  private handleHelpAction(action: string) {
    switch (action) {
      case 'wiki':
        msgBox.show(lang.transl('_使用手册说明'), {
          title: lang.transl('_使用手册'),
        })
        return

      case 'faq': {
        let msg =
          lang.transl('_常见问题说明') + lang.transl('_账户可能被封禁的警告')
        if (Config.mobile) {
          msg += lang.transl('_移动端浏览器可能不会建立文件夹的说明')
        }
        msgBox.show(msg, {
          title: lang.transl('_常见问题'),
        })
        return
      }

      case 'recentUpdates':
        EVT.fire('showRecentUpdates')
        return

      case 'github':
        msgBox.show(lang.transl('_GitHub说明'), {
          title: 'GitHub',
        })
        return

      case 'discord':
        msgBox.show(lang.transl('_Discord说明'), {
          title: 'Discord',
        })
        return

      case 'qq':
        msgBox.show(lang.transl('_QQ群说明'), {
          title: lang.transl('_QQ群'),
        })
        return

      case 'fanbox':
        msgBox.show(lang.transl('_fanboxDownloader的说明'), {
          title: 'Pixiv Fanbox Downloader',
        })
        return

      case 'airport':
        msgBox.show(lang.transl('_机场推荐说明'), {
          title: lang.transl('_机场推荐'),
        })
        return

      case 'sponsorship':
        msgBox.show(lang.transl('_赞助方式提示'), {
          title: lang.transl('_赞助我'),
        })
        return

      case 'thirdParty':
        msgBox.show(lang.transl('_第三方库说明'), {
          title: lang.transl('_第三方库'),
        })
        return

      case 'reset':
        EVT.fire('resetHelpTip')
        msgBox.show(lang.transl('_重新显示帮助的说明'), {
          title: lang.transl('_重新显示帮助'),
        })
        return
    }
  }

  private updateDownloadSummary() {
    const total = store.result.length
    const downloaded = total > 0 ? downloadStates.downloadedCount() : 0
    this.summaryProgress.textContent = `${downloaded} / ${total}`
    this.summaryWrap.style.display = total > 0 ? 'block' : 'none'

    if (total === 0) {
      this.setDownloadSummaryState('start')
      return
    }

    if (downloaded >= total) {
      this.setDownloadSummaryState('complete')
      return
    }

    if (this.downloadSummaryState === 'complete') {
      this.setDownloadSummaryState('start')
    }
  }

  private setDownloadSummaryState(state: DownloadSummaryState) {
    this.downloadSummaryState = state
    switch (state) {
      case 'loading':
        this.setSummaryState('_正在下载中', 'loading')
        return
      case 'pause':
        this.setSummaryState('_下载已暂停', 'pause')
        return
      case 'stop':
        this.setSummaryState('_下载已停止', 'stop')
        return
      case 'complete':
        this.setSummaryState('_下载完毕', 'complete')
        return
      default:
        this.setSummaryState('_未开始下载', 'start')
        return
    }
  }

  private setSummaryState(textKey: LangTextKey, iconId: string) {
    this.summaryStateSVG.classList.toggle('is-loading', iconId === 'loading')
    this.summaryStateSVG.setAttribute('title', lang.transl(textKey))
    this.summaryStateIconUse.setAttribute('xlink:href', `#${iconId}`)
  }

  private expandHomeDownloadSection() {
    const homeState = this.getPersistedPageState('home')
    if (homeState?.downloadArea) {
      return
    }

    const nextExpandedCards = Utils.deepCopy(settings.expandedCards)
    const nextHomeState = this.getPersistedPageState('home', nextExpandedCards)
    if (nextHomeState) {
      nextHomeState.downloadArea = true
    }
    setSetting('expandedCards', nextExpandedCards)
  }

  private updatePinnedSectionVisibility() {
    const pinnedSection = this.foldableSections.get(
      this.makeSectionKey('home', 'pinnedOptions')
    )
    if (!pinnedSection) {
      return
    }
    pinnedSection.root.style.display =
      settings.pinnedOptions.length > 0 ? 'block' : 'none'
  }

  private updateSearchClearButton() {
    this.clearSearchBtn.classList.toggle(
      'visible',
      this.searchInput.value.trim() !== ''
    )
  }

  private clickRealButton(selector: string) {
    const button = this.form.querySelector(selector) as HTMLButtonElement | null
    button?.click()
  }

  private playNavRipple(button: HTMLButtonElement) {
    this.playRipple(button)
  }

  private playRipple(button: HTMLButtonElement) {
    if (!button.querySelector('.ripple')) {
      return
    }
    button.classList.remove('ripple-active')
    void button.offsetWidth
    button.classList.add('ripple-active')
    window.setTimeout(() => {
      button.classList.remove('ripple-active')
    }, 650)
  }

  private findSlot(name: string) {
    return this.form.querySelector(`slot[data-name="${name}"]`) as HTMLElement
  }

  private findSlotBlock(name: string) {
    return this.findSlot(name).parentElement as HTMLDivElement
  }

  private getCanonicalContainer(level1: OptionCategoryLevel1, level2: string) {
    return this.canonicalContainers.get(
      this.makeCanonicalKey(level1, level2)
    ) as HTMLDivElement
  }

  private makeCanonicalKey(level1: OptionCategoryLevel1, level2: string) {
    return `${level1}__${level2}`
  }

  private makeSectionKey(page: PageId, id: string) {
    return `${page}__${id}`
  }

  private getPersistedPageState(
    page: PersistedPageId,
    expandedCards = settings.expandedCards
  ) {
    return expandedCards[page]
  }
}

export { SettingsPanel }
