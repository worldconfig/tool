// 背景脚本
chrome.runtime.onInstalled.addListener(() => {
  // 设置默认预设
  // chrome.storage.sync.set({
  //   presets: [
  //     {name: '小图标', width: 32, height: 32},
  //     {name: '中图标', width: 64, height: 64},
  //     {name: '大图标', width: 128, height: 128},
  //     {name: '缩略图', width: 200, height: 150},
  //     {name: '中等尺寸', width: 800, height: 600},
  //     {name: '高清', width: 1920, height: 1080}
  //   ],
  //   saveFolder: 'resized_images',
  //   filenameFormat: 'original_preset'
  // });
//(预设暂时注释)
  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'resizeImage',
    title: '调整图片尺寸',
    contexts: ['image']
  });
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'resizeImage' && info.srcUrl) {
    // 打开侧边栏
    chrome.sidePanel.open({ windowId: tab.windowId });
    
    // 发送图片URL到侧边栏
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'addImageFromWeb',
        url: info.srcUrl
      });
    }, 500);
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "openSidePanel") {
    // 从popup打开时，需要获取当前活动窗口
    // popup没有tab信息，所以直接获取当前窗口
    chrome.windows.getCurrent((window) => {
      if (window && window.id) {
        chrome.sidePanel.open({ windowId: window.id }).catch((error) => {
          console.error('打开侧边栏失败:', error);
        });
      }
    });
  }
  return true; // 保持消息通道开放
});

// 扩展图标点击时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});