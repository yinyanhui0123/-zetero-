import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";

// 类型声明
declare const Zotero: any;
declare const _ZoteroTypes: any;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // 初始化插件
  await addon.initialize();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
}

async function onMainWindowLoad(win: any): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString("startup-begin"),
      type: "default",
      progress: 0,
    })
    .show();

  await Zotero.Promise.delay(500);

  // 添加菜单项
  addMenuItems(win);

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString("startup-finish")}`,
  });
  popupWin.startCloseTimer(2000);
}

/**
 * 获取 Tools 菜单的弹出层（兼容不同 Zotero 版本的 DOM 结构）
 */
function getToolsMenuPopup(doc: Document): Element | null {
  // 优先使用 Zotero 常见的 Tools 下拉内容 ID
  const byId = doc.getElementById("menu_ToolsPopup");
  if (byId) return byId;
  // 备用：通过 Tools 菜单项获取其 menupopup
  const toolsMenu = doc.getElementById("menu_Tools");
  if (toolsMenu) {
    const menupopup = toolsMenu.querySelector("menupopup") || toolsMenu.firstElementChild;
    if (menupopup) return menupopup;
  }
  // 再备用：任意带 Tools 的 menu 的 menupopup
  const menu = doc.querySelector('menu[id*="Tools"] menupopup, menu[id*="tools"] menupopup');
  return menu || null;
}

/**
 * 添加菜单项
 * @param win 主窗口
 */
function addMenuItems(win: any) {
  try {
    const toolsMenu = getToolsMenuPopup(win.document);
    if (!toolsMenu) {
      ztoolkit.log("Tools menu not found (tried menu_ToolsPopup, menu_Tools)");
      return;
    }

    // 创建分隔符
    const separator = win.document.createXULElement("menuseparator");
    separator.id = "literature-tracker-separator";

    // 创建主菜单项
    const mainMenuItem = win.document.createXULElement("menu");
    mainMenuItem.id = "literature-tracker-menu";
    mainMenuItem.setAttribute("label", "文献追踪");

    // 创建子菜单
    const subMenu = win.document.createXULElement("menupopup");
    subMenu.id = "literature-tracker-submenu";

    // 创建构建用户画像菜单项
    const buildProfileMenuItem = win.document.createXULElement("menuitem");
    buildProfileMenuItem.id = "literature-tracker-build-profile";
    buildProfileMenuItem.setAttribute("label", "构建用户画像");
    buildProfileMenuItem.setAttribute("accesskey", "B");
    buildProfileMenuItem.addEventListener("command", () => {
      addon.hooks.buildUserProfile();
    });

    // 查看用户画像（验证是否成功使用）
    const viewProfileMenuItem = win.document.createXULElement("menuitem");
    viewProfileMenuItem.id = "literature-tracker-view-profile";
    viewProfileMenuItem.setAttribute("label", "查看用户画像");
    viewProfileMenuItem.setAttribute("accesskey", "V");
    viewProfileMenuItem.addEventListener("command", () => {
      addon.hooks.showUserProfileSummary();
    });

    // 创建主动推送菜单项
    const pushPapersMenuItem = win.document.createXULElement("menuitem");
    pushPapersMenuItem.id = "literature-tracker-push-papers";
    pushPapersMenuItem.setAttribute("label", "推送今日文献");
    pushPapersMenuItem.setAttribute("accesskey", "P");
    pushPapersMenuItem.addEventListener("command", () => {
      addon.hooks.pushTodayPapers();
    });

    // 创建追踪文献菜单项
    const trackLiteratureMenuItem = win.document.createXULElement("menuitem");
    trackLiteratureMenuItem.id = "literature-tracker-track-literature";
    trackLiteratureMenuItem.setAttribute("label", "追踪文献");
    trackLiteratureMenuItem.setAttribute("accesskey", "T");
    trackLiteratureMenuItem.addEventListener("command", () => {
      addon.hooks.triggerLiteratureTracking();
    });

    // 创建设置菜单项
    const settingsMenuItem = win.document.createXULElement("menuitem");
    settingsMenuItem.id = "literature-tracker-settings";
    settingsMenuItem.setAttribute("label", "设置");
    settingsMenuItem.setAttribute("accesskey", "S");
    settingsMenuItem.addEventListener("command", () => {
      addon.hooks.openSettingsWindow();
    });

    // 组装菜单
    subMenu.appendChild(buildProfileMenuItem);
    subMenu.appendChild(viewProfileMenuItem);
    subMenu.appendChild(pushPapersMenuItem);
    subMenu.appendChild(trackLiteratureMenuItem);
    subMenu.appendChild(settingsMenuItem);
    mainMenuItem.appendChild(subMenu);

    // 添加到工具菜单
    toolsMenu.appendChild(separator);
    toolsMenu.appendChild(mainMenuItem);

    ztoolkit.log("Menu items added successfully");
  } catch (error) {
    ztoolkit.log(`Error adding menu items: ${error}`);
  }
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

async function onShutdown(): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();

  // 卸载插件
  await addon.unload();

  // Remove addon object
  addon.data.alive = false;
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // You can add your code to the corresponding notify type
  ztoolkit.log("notify", event, type, ids, extraData);
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

/**
 * 处理快捷键事件
 */
function onShortcutKey() {
  ztoolkit.log("Shortcut key pressed!");
  // 这里可以添加快捷键触发的逻辑
  // 例如：手动触发文献追踪和推送
  addon.hooks.triggerLiteratureTracking();
}

/**
 * 打开设置窗口
 */
function openSettingsWindow() {
  ztoolkit.log("Opening settings window...");
  try {
    // 直接打开设置窗口
    const win = Zotero.getMainWindow().open(
      "chrome://literature-tracker/content/preferences.xhtml",
      "literature-tracker-preferences",
      "chrome,centerscreen,width=640,height=760,resizable=yes"
    );
    if (win) {
      ztoolkit.log("Settings window opened successfully");
    } else {
      ztoolkit.log("Failed to open settings window");
    }
  } catch (error) {
    ztoolkit.log(`Error opening settings window: ${error}`);
  }
}

/**
 * 显示推荐文献窗口
 */
function showRecommendedPapers() {
  ztoolkit.log("Showing recommended papers window...");
  try {
    // 调用插件的方法显示推荐文献
    addon.showRecommendedPapers();
  } catch (error) {
    ztoolkit.log(`Error showing recommended papers: ${error}`);
  }
}

/**
 * 触发文献追踪
 */
async function triggerLiteratureTracking() {
  try {
    const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
      .createLine({
        text: "开始追踪arXiv文献...",
        type: "default",
        progress: 0,
      })
      .show();

    // 使用文献追踪服务获取文献
    if (addon.data.literatureTrackingService) {
      await Zotero.Promise.delay(500);

      popupWin.changeLine({
        progress: 30,
        text: "正在从arXiv获取最新文献...",
      });

      const papers = await addon.data.literatureTrackingService.fetchRecentPapers(7);

      await Zotero.Promise.delay(500);

      popupWin.changeLine({
        progress: 70,
        text: `找到 ${papers.length} 篇新文献`,
      });

      await Zotero.Promise.delay(500);

      popupWin.changeLine({
        progress: 100,
        text: `文献追踪完成！共获取 ${papers.length} 篇文献`,
      });

      ztoolkit.log(`Fetched ${papers.length} papers from arXiv`);

      // 可以在这里添加将文献保存到Zotero的逻辑
      // 或者显示文献列表供用户选择
    } else {
      throw new Error("Literature tracking service not initialized");
    }

    popupWin.startCloseTimer(3000);
  } catch (error) {
    ztoolkit.log(`Error triggering literature tracking: ${error}`);
    new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
      .createLine({
        text: `追踪失败: ${error}`,
        type: "error",
        progress: 100,
      })
      .show()
      .startCloseTimer(3000);
  }
}

/**
 * 构建用户画像
 */
async function buildUserProfile() {
  try {
    const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
      .createLine({
        text: "开始构建用户画像...",
        type: "default",
        progress: 0,
      })
      .show();

    await Zotero.Promise.delay(500);

    // 调用插件的方法构建用户画像
    await addon.buildUserProfile();

    await Zotero.Promise.delay(500);

    popupWin.changeLine({
      progress: 100,
      text: "用户画像构建完成！",
    });

    popupWin.startCloseTimer(3000);
  } catch (error) {
    ztoolkit.log(`Error building user profile: ${error}`);
    new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
      .createLine({
        text: `用户画像构建失败: ${error}`,
        type: "error",
        progress: 100,
      })
      .show()
      .startCloseTimer(3000);
  }
}

/**
 * 查看用户画像摘要（验证画像是否已构建并被使用）
 */
async function showUserProfileSummary() {
  await addon.showUserProfileSummary();
}

/**
 * 主动推送今日文献
 */
async function pushTodayPapers() {
  try {
    const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
      .createLine({
        text: "开始推送今日文献...",
        type: "default",
        progress: 0,
      })
      .show();

    await Zotero.Promise.delay(500);

    // 调用插件的方法推送今日文献
    const pushedCount = await addon.fetchAndPushTodayPapers();

    await Zotero.Promise.delay(500);

    if (pushedCount > 0) {
      popupWin.changeLine({
        progress: 100,
        text: `今日文献推送完成！共推送 ${pushedCount} 篇相关文献`,
      });
    } else {
      // 不显示完成通知，因为 fetchAndPushTodayPapers 已经显示了具体的通知
      popupWin.close();
      return;
    }

    popupWin.startCloseTimer(3000);
  } catch (error) {
    ztoolkit.log(`Error pushing today's papers: ${error}`);
    new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
      .createLine({
        text: `推送失败: ${error}`,
        type: "error",
        progress: 100,
      })
      .show()
      .startCloseTimer(3000);
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcutKey,
  openSettingsWindow,
  triggerLiteratureTracking,
  buildUserProfile,
  showUserProfileSummary,
  pushTodayPapers,
}; 
