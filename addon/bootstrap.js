/**
 * Most of this code is from Zotero team's official Make It Red example[1]
 * or the Zotero 7 documentation[2].
 * [1] https://github.com/zotero/make-it-red
 * [2] https://www.zotero.org/support/dev/zotero_7_for_developers
 */

var chromeHandle;

function install(data, reason) { }

/**
 * 尝试启动 Python 文献服务（由 addon 在检测到服务未运行时调用）
 * @param {string} startCommand - 启动脚本完整路径，如 D:\...\start-server.bat 或 /path/to/start-server.sh
 * @returns {boolean} 是否已尝试启动
 */
function tryStartPythonServer(startCommand) {
  if (!startCommand || typeof startCommand !== "string") return false;
  startCommand = startCommand.trim();
  if (!startCommand) return false;
  try {
    var Cc = Components.classes;
    var Ci = Components.interfaces;
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(startCommand);
    if (!file.exists()) return false;
    var workDir = file.parent;
    var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    var isWin = Services.appinfo.OS === "WINNT";
    if (isWin) {
      var leaf = file.leaf;
      var isBat = leaf.toLowerCase().slice(-4) === ".bat" || leaf.toLowerCase().slice(-4) === ".cmd";
      if (isBat) {
        var cmd = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        cmd.initWithPath("C:\\Windows\\System32\\cmd.exe");
        if (!cmd.exists()) cmd.initWithPath("cmd.exe");
        process.init(cmd);
        process.run(false, ["/c", file.path], 1, workDir);
      } else {
        process.init(file);
        process.run(false, [], 0, workDir);
      }
    } else {
      file.permissions = 0755;
      process.init(file);
      process.run(false, [], 0, workDir);
    }
    return true;
  } catch (e) {
    try { Components.utils.reportError("Literature Tracker tryStartPythonServer: " + e.message); } catch (err) {}
    return false;
  }
}

/**
 * 写入文本到文件（用于用户画像 JSON 存储，避免依赖 SQLite）
 * @param {string} filePath - 完整路径
 * @param {string} content - 文本内容
 * @returns {boolean} 是否成功
 */
function writeTextFile(filePath, content) {
  try {
    var Cc = Components.classes;
    var Ci = Components.interfaces;
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(filePath);
    var stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
    stream.init(file, 0x02 | 0x08 | 0x20, 0x1B4, 0);
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    var buf = converter.convertToByteArray(content);
    stream.write(buf, buf.length);
    stream.close();
    return true;
  } catch (e) {
    try { Components.utils.reportError("Literature Tracker writeTextFile: " + e.message); } catch (err) {}
    return false;
  }
}

/**
 * 从文件读取文本
 * @param {string} filePath - 完整路径
 * @returns {string|null} 文件内容或 null
 */
function readTextFile(filePath) {
  try {
    var Cc = Components.classes;
    var Ci = Components.interfaces;
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(filePath);
    if (!file.exists()) return null;
    var stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    stream.init(file, 0x01, 0, null);
    var reader = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
    reader.init(stream, "UTF-8", 1024, 0);
    var chunk = {};
    var result = [];
    var n;
    while ((n = reader.readString(8192, chunk)) > 0) {
      result.push(chunk.value);
    }
    reader.close();
    return result.join("");
  } catch (e) {
    try { Components.utils.reportError("Literature Tracker readTextFile: " + e.message); } catch (err) {}
    return null;
  }
}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "__addonRef__", rootURI + "content/"],
  ]);

  if (typeof Zotero !== "undefined") {
    Zotero.LiteratureTrackerTryStartPythonServer = tryStartPythonServer;
    Zotero.LiteratureTrackerWriteTextFile = writeTextFile;
    Zotero.LiteratureTrackerReadTextFile = readTextFile;
  }

  /**
   * Global variables for plugin code.
   * The `_globalThis` is the global root variable of the plugin sandbox environment
   * and all child variables assigned to it is globally accessible.
   * See `src/index.ts` for details.
   */
  const ctx = { rootURI };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}/content/scripts/__addonRef__.js`,
    ctx,
  );

  // 直接向错误控制台输出信息
  function log(message) {
    try {
      // 方式1：Components.utils.reportError
      Components.utils.reportError(`Literature Tracker: ${message}`);

      // 方式2：Zotero.debug
      if (typeof Zotero !== 'undefined' && Zotero.debug) {
        Zotero.debug(`Literature Tracker: ${message}`);
      }

      // 方式3：console.log (如果可用)
      if (typeof console !== 'undefined' && console.log) {
        console.log(`Literature Tracker: ${message}`);
      }
    } catch (e) {
      // 忽略日志错误
    }
  }

  // 添加调试日志
  log("Starting up...");
  log(`Plugin ID: ${id}`);
  log(`Root URI: ${rootURI}`);
  log(`Zotero object available: ${typeof Zotero !== 'undefined'}`);

  if (typeof Zotero !== 'undefined') {
    log(`Zotero version: ${Zotero.version}`);

    // 创建菜单项作为访问方式
    log("Creating menu item for settings...");
    try {
      // 等待Zotero完全加载后再添加菜单
      setTimeout(() => {
        try {
          const doc = Zotero.getMainWindow().document;
          if (doc) {
            const toolsMenu = doc.getElementById('menu_Tools');
            if (toolsMenu) {
              const menuSeparator = doc.createElement('menuseparator');
              menuSeparator.id = 'literature-tracker-separator';
              toolsMenu.appendChild(menuSeparator);

              const menuItem = doc.createElement('menuitem');
              menuItem.id = 'literature-tracker-settings';
              menuItem.setAttribute('label', '文献追踪 设置');
              menuItem.setAttribute('oncommand', `
                window.open(
                  'chrome://literature-tracker/content/preferences.xhtml',
                  'literature-tracker-preferences',
                  'chrome,centerscreen,width=640,height=760,resizable=yes'
                );
              `);
              toolsMenu.appendChild(menuItem);
              log("Menu item added successfully");
            } else {
              log("Tools menu not found");
            }
          }
        } catch (e) {
          log(`Error adding menu item: ${e.message}`);
        }
      }, 2000);
    } catch (e) {
      log(`Error in menu creation: ${e.message}`);
    }

    // 注册数字"0"键快捷键，用于打开设置窗口
    log("Registering shortcut key '0' for settings...");
    try {
      if (typeof Zotero.OverlayManager !== 'undefined') {
        Zotero.OverlayManager.add({
          "": [{
            tag: "key",
            attributes: {
              id: "literature-tracker-settings-key",
              key: "0",
              oncommand: "Zotero.LiteratureTracker.hooks.openSettingsWindow()"
            }
          }]
        });
        log("Shortcut key '0' registered successfully");
      } else if (typeof Zotero.getMainWindows !== 'undefined') {
        // 备用方案：为每个主窗口添加键盘监听器
        const mainWindows = Zotero.getMainWindows();
        log(`Found ${mainWindows.length} main windows`);

        mainWindows.forEach(function (win) {
          try {
            win.addEventListener('keypress', function (event) {
              // 检查是否按了数字"0"键
              if (event.key === '0' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                // 直接打开设置窗口
                win.open(
                'chrome://literature-tracker/content/preferences.xhtml',
                'literature-tracker-preferences',
                'chrome,centerscreen,width=640,height=760,resizable=yes'
                );
              }
            }, false);
            log("Added keypress listener to main window");
          } catch (e) {
            log(`Error adding keypress listener: ${e.message}`);
          }
        });
      }
    } catch (e) {
      log(`Error registering shortcut key: ${e.message}`);
      if (e.stack) {
        log(`Error stack: ${e.stack}`);
      }
    }
  }

  try {
    if (typeof Zotero !== 'undefined' && Zotero.__addonInstance__ && Zotero.__addonInstance__.hooks) {
      await Zotero.__addonInstance__.hooks.onStartup();
      log("onStartup completed successfully");
    } else {
      log("Zotero.__addonInstance__ or hooks not available");
    }
  } catch (e) {
    log(`Error in onStartup: ${e.message}`);
    if (e.stack) {
      log(`Error stack: ${e.stack}`);
    }
  }
}

async function onMainWindowLoad({ window }, reason) {
  try {
    if (typeof Zotero !== 'undefined' && Zotero.__addonInstance__ && Zotero.__addonInstance__.hooks) {
      await Zotero.__addonInstance__.hooks.onMainWindowLoad(window);
    }

    // 为新窗口添加键盘监听器
    try {
      window.addEventListener('keypress', function (event) {
        // 检查是否按了数字"0"键
        if (event.key === '0' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          // 直接打开设置窗口
          window.open(
            'chrome://literature-tracker/content/preferences.xhtml',
            'literature-tracker-preferences',
            'chrome,centerscreen,width=640,height=760,resizable=yes'
          );
        }
      }, false);
    } catch (e) {
      // 忽略错误
    }
  } catch (e) {
    try {
      Components.utils.reportError(`Literature Tracker ERROR in onMainWindowLoad: ${e.message}`);
    } catch (ignore) { }
  }
}

async function onMainWindowUnload({ window }, reason) {
  try {
    if (typeof Zotero !== 'undefined' && Zotero.__addonInstance__ && Zotero.__addonInstance__.hooks) {
      await Zotero.__addonInstance__.hooks.onMainWindowUnload(window);
    }
  } catch (e) {
    try {
      Components.utils.reportError(`Literature Tracker ERROR in onMainWindowUnload: ${e.message}`);
    } catch (ignore) { }
  }
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) {
    return;
  }

  try {
    if (typeof Zotero !== 'undefined' && Zotero.__addonInstance__ && Zotero.__addonInstance__.hooks) {
      await Zotero.__addonInstance__.hooks.onShutdown();
    }
  } catch (e) {
    try {
      Components.utils.reportError(`Literature Tracker ERROR in shutdown: ${e.message}`);
    } catch (ignore) { }
  }

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

async function uninstall(data, reason) { }
