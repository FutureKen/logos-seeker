/**
 * UI strings for the two display languages. Kept in one place so every
 * component can ask for `tr(lang)` and read plain properties (or call the
 * small formatter functions) instead of branching on the language inline.
 */

const en = {
  brand: "Logos Seeker",
  langGroup: "Display language",
  searchAria: "Search the Bible",
  placeholder: "Search — e.g. rev222, 启222, tree of life, 生命树",
  clear: "Clear (Esc)",
  clearAria: "Clear search (Esc)",
  back: "Back to search results",
  copy: "Copy",
  copyAria: "Copy verse",
  showChapter: "Show full chapter",
  enVersification: "(EN versification)",
  noResults: "No results found.",
  refNotFound: "Reference not found.",
  searching: "Searching…",
  loadingData: "Loading Bible data (first search)…",
  loadFailed: "Failed to load Bible data.",
  minChars: "Type at least 2 characters to search English text.",
  results: (n) => `${n} ${n === 1 ? "result" : "results"}`,
  showing: (shown, total) =>
    `Showing ${shown} of ${total} ${total === 1 ? "match" : "matches"}`,
  more: (n) => `More results (${n} more)`,
  possible: (n) => `${n} possible references`,
  wholeChapter: "Whole chapter →",
  interlinear: "Interlinear",
  prevChapter: "Previous chapter",
  nextChapter: "Next chapter",
  deselect: (n) => `Deselect all (${n})`,
  themeToDark: "Switch to dark mode",
  themeToLight: "Switch to light mode",
  installLink: "How to add to Home Screen",
  installTitle: "Add to Home Screen (iPhone / iPad)",
  installNote:
    "After adding it, open it once with a connection and wait ~15 seconds while the Bible text is stored on the device — after that it works with no signal.",
  close: "Close",
  // --- study gate ---
  unlock: "Unlock",
  unlockTitle: "Unlock study notes",
  password: "Password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  wrongPassword: "Wrong password",
  studyUnavailable: "Study data not available",
  unlocking: "Unlocking…",
  notes: "Notes",
  notesAria: "Show footnotes, cross-references and outlines",
  lock: "Lock",
};

const cn = {
  ...en,
  brand: "Logos Seeker",
  langGroup: "显示语言",
  searchAria: "搜索圣经",
  clear: "清除",
  clearAria: "清除搜索（Esc）",
  back: "返回搜索结果",
  copy: "复制",
  copyAria: "复制经文",
  showChapter: "查看整章",
  enVersification: "（英文分节）",
  noResults: "未找到结果。",
  refNotFound: "未找到该处经文。",
  searching: "搜索中…",
  loadingData: "首次加载经文数据…",
  loadFailed: "数据加载失败。",
  minChars: "英文搜索请至少输入 2 个字符。",
  results: (n) => `共 ${n} 处匹配`,
  showing: (shown, total) => `显示 ${shown} / 共 ${total} 处匹配`,
  more: (n) => `更多结果（还有 ${n}）`,
  possible: (n) => `多个可能的出处（${n}）`,
  wholeChapter: "整章 →",
  interlinear: "对照",
  prevChapter: "上一章",
  nextChapter: "下一章",
  deselect: (n) => `取消选择 (${n})`,
  installLink: "如何添加到主屏幕",
  installTitle: "添加到主屏幕（iPhone / iPad）",
  installNote:
    "添加后，请在有网络时打开一次并等待约 15 秒，让经文数据存到设备上；之后即使没有网络也能使用。",
  close: "关闭",
  unlock: "解锁",
  unlockTitle: "解锁注解",
  password: "密码",
  showPassword: "显示密码",
  hidePassword: "隐藏密码",
  wrongPassword: "密码错误",
  studyUnavailable: "注解数据不可用",
  unlocking: "解锁中…",
  notes: "注解",
  notesAria: "显示注解、串珠与纲要",
  lock: "锁定",
};

/** @param {"en"|"cn"} lang */
export function tr(lang) {
  return lang === "cn" ? cn : en;
}

/**
 * Screenshots of the iOS Safari "add to Home Screen" flow, in the order they
 * are performed. `w`/`h` are the intrinsic pixel sizes so the dialog does not
 * jump while the images load. Each caption is a list of runs; a `b` run is bold.
 */
export const HELP_STEPS = [
  {
    img: "assets/ios-1-more.jpg",
    w: 694,
    h: 150,
    en: [
      { t: "In Safari, tap the " },
      { b: "•••" },
      { t: " button at the right of the address bar." },
    ],
    cn: [{ t: "在 Safari 中，点按网址栏右侧的 " }, { b: "•••" }, { t: " 按钮。" }],
  },
  {
    img: "assets/ios-2-share.jpg",
    w: 378,
    h: 458,
    en: [{ t: "Choose " }, { b: "Share" }, { t: " at the top of the menu." }],
    cn: [{ t: "在菜单顶部选择 " }, { b: "分享" }, { t: "（Share）。" }],
  },
  {
    img: "assets/ios-3-add.jpg",
    w: 366,
    h: 468,
    en: [
      { t: "Scroll down and tap " },
      { b: "Add to Home Screen" },
      { t: ", then " },
      { b: "Add" },
      { t: "." },
    ],
    cn: [
      { t: "向下滑动，点按 " },
      { b: "添加到主屏幕" },
      { t: "（Add to Home Screen），然后点 " },
      { b: "添加" },
      { t: "。" },
    ],
  },
];
