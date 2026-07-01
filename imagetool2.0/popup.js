document.addEventListener('DOMContentLoaded', function() {
  // 打开侧边栏
  document.getElementById('openSidePanel').addEventListener('click', async function() {
    try {
      // 直接获取当前窗口并打开侧边栏
      const window = await chrome.windows.getCurrent();
      if (window && window.id) {
        await chrome.sidePanel.open({ windowId: window.id });
        window.close();
      }
    } catch (error) {
      console.error('打开侧边栏失败:', error);
      // 如果直接打开失败，尝试通过消息传递
      chrome.runtime.sendMessage({action: "openSidePanel"}, (response) => {
        if (chrome.runtime.lastError) {
          console.error('发送消息失败:', chrome.runtime.lastError);
        }
        window.close();
      });
    }
  });

  // 加载设置
  loadSettings();

  // 保存文件夹设置
  document.getElementById('saveFolder').addEventListener('change', saveSettings);
  
  // 浏览文件夹
  document.getElementById('browseFolder').addEventListener('click', async function() {
    try {
      // 使用File System Access API打开文件夹选择器
      if ('showDirectoryPicker' in window) {
        const handle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'downloads'
        });
        
        // 获取文件夹名称
        const folderName = handle.name;
        
        // 由于Chrome扩展的下载API需要相对路径，我们需要让用户确认或输入相对路径
        // 使用文件夹名称作为默认值，但允许用户修改
        const currentPath = document.getElementById('saveFolder').value || folderName;
        const folderPath = prompt(
          '已选择文件夹: ' + folderName + '\n\n' +
          '请输入相对于下载文件夹的路径（可以使用选择的文件夹名称，或输入自定义路径）:\n' +
          '例如: ' + folderName + ' 或 images/' + folderName,
          folderName
        );
        
        if (folderPath !== null && folderPath.trim()) {
          // 清理路径，移除开头的斜杠和末尾的斜杠
          const cleanPath = folderPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
          document.getElementById('saveFolder').value = cleanPath;
          saveSettings();
        }
      } else {
        // 降级方案：如果浏览器不支持，使用输入框
        const currentPath = document.getElementById('saveFolder').value || 'resized_images';
        const folderPath = prompt('您的浏览器不支持文件夹选择器。\n请输入文件夹路径（相对于下载文件夹）:\n例如: images/resized 或 resized_images', currentPath);
        
        if (folderPath !== null && folderPath.trim()) {
          const cleanPath = folderPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
          document.getElementById('saveFolder').value = cleanPath;
          saveSettings();
        }
      }
    } catch (err) {
      // 用户取消了选择或其他错误
      if (err.name !== 'AbortError') {
        console.error('选择文件夹失败:', err);
        // 如果出错，降级到输入框方式
        const currentPath = document.getElementById('saveFolder').value || 'resized_images';
        const folderPath = prompt('无法打开文件夹选择器。\n请输入文件夹路径（相对于下载文件夹）:\n例如: images/resized 或 resized_images', currentPath);
        
        if (folderPath !== null && folderPath.trim()) {
          const cleanPath = folderPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
          document.getElementById('saveFolder').value = cleanPath;
          saveSettings();
        }
      }
    }
  });

  async function loadSettings() {
    const result = await chrome.storage.sync.get(['saveFolder', 'selectedFolderPath']);
    // 优先使用selectedFolderPath，如果没有则使用saveFolder
    const folderPath = result.selectedFolderPath || result.saveFolder || 'resized_images';
    document.getElementById('saveFolder').value = folderPath;
  }

  function saveSettings() {
    const folderPath = document.getElementById('saveFolder').value;
    // 同时保存到两个字段，确保兼容性
    chrome.storage.sync.set({
      saveFolder: folderPath,
      selectedFolderPath: folderPath
    });
  }
});