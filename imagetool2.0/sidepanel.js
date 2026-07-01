class ImageResizer {
  constructor() {
    this.images = [];
    this.currentSize = null;
    this.settings = {};
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get(['saveFolder', 'filenameFormat', 'savedWidth', 'savedHeight', 'outputFormat', 'convertMode', 'selectedFolderPath', 'autoProcess']);
    this.settings = {
      saveFolder: result.saveFolder || 'resized_images',
      filenameFormat: result.filenameFormat || 'original_custom',
      selectedFolderPath: result.selectedFolderPath || '',
      autoProcess: result.autoProcess || false
    };
    document.getElementById('currentFolder').value = this.settings.selectedFolderPath || this.settings.saveFolder;
    
    // 加载保存的尺寸参数
    if (result.savedWidth && result.savedHeight) {
      document.getElementById('customWidth').value = result.savedWidth;
      document.getElementById('customHeight').value = result.savedHeight;
      // 自动应用保存的尺寸
      this.currentSize = {
        width: parseInt(result.savedWidth),
        height: parseInt(result.savedHeight)
      };
    }
    
    // 加载保存的格式和转换模式
    if (result.outputFormat) {
      document.getElementById('outputFormat').value = result.outputFormat;
    }
    if (result.convertMode) {
      document.getElementById('convertMode').value = result.convertMode;
    }
    
    // 加载自动处理设置
    if (result.autoProcess !== undefined) {
      document.getElementById('autoProcess').checked = result.autoProcess;
    }
  }

  setupEventListeners() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const browseButton = document.getElementById('browseButton');
    const clearAllButton = document.getElementById('clearAll');
    const processAllButton = document.getElementById('processAll');
    const applyCustomButton = document.getElementById('applyCustom');
    const selectFolderButton = document.getElementById('selectFolder');

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      
      const items = Array.from(e.dataTransfer.items);
      
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          await this.addImage(file);
        } else if (item.kind === 'string' && item.type === 'text/uri-list') {
          // 处理网页图片拖拽
          item.getAsString(async (url) => {
            if (url.startsWith('http')) {
              await this.addImageFromURL(url);
            }
          });
        }
      }
    });

    // 文件选择
    browseButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        await this.addImage(file);
      }
      fileInput.value = '';
    });

    // 自定义尺寸
    applyCustomButton.addEventListener('click', () => {
      const width = parseInt(document.getElementById('customWidth').value);
      const height = parseInt(document.getElementById('customHeight').value);
      
      if (width && height) {
        this.currentSize = {width, height};
        // 保存尺寸参数到storage
        chrome.storage.sync.set({
          savedWidth: width,
          savedHeight: height
        });
        this.showStatus(`已设置尺寸: ${width}×${height}`, 'success');
      } else {
        this.showStatus('请输入有效的宽度和高度', 'error');
      }
      this.updateUI();
    });

    // 格式选择
    const outputFormat = document.getElementById('outputFormat');
    outputFormat.addEventListener('change', () => {
      chrome.storage.sync.set({ outputFormat: outputFormat.value });
      this.updateUI();
    });

    // 转换模式选择
    const convertMode = document.getElementById('convertMode');
    convertMode.addEventListener('change', () => {
      chrome.storage.sync.set({ convertMode: convertMode.value });
      this.updateUI();
    });

    // 自动处理设置
    const autoProcess = document.getElementById('autoProcess');
    autoProcess.addEventListener('change', () => {
      this.settings.autoProcess = autoProcess.checked;
      chrome.storage.sync.set({ autoProcess: autoProcess.checked });
      this.showStatus(autoProcess.checked ? '已启用自动处理' : '已禁用自动处理', 'success');
    });

    // 选择文件夹
    selectFolderButton.addEventListener('click', async () => {
      // 让用户输入文件夹路径（相对于下载文件夹）
      // 例如：images/resized 或 resized_images
      const currentPath = this.settings.selectedFolderPath || this.settings.saveFolder || 'resized_images';
      const folderPath = prompt('请输入文件夹路径（相对于下载文件夹，例如: images/resized）:', currentPath);
      
      if (folderPath !== null && folderPath.trim()) {
        // 清理路径，移除开头的斜杠
        const cleanPath = folderPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        this.settings.selectedFolderPath = cleanPath;
        document.getElementById('currentFolder').value = cleanPath;
        await chrome.storage.sync.set({ selectedFolderPath: cleanPath });
        this.showStatus(`已设置文件夹路径: ${cleanPath}`, 'success');
      }
    });

    // 批量处理
    processAllButton.addEventListener('click', () => this.processAllImages());

    // 清空列表
    clearAllButton.addEventListener('click', () => {
      this.images = [];
      this.renderImageList();
      this.updateUI();
    });

    // 监听来自内容脚本的消息（网页图片拖拽）
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'addImageFromWeb') {
        this.addImageFromURL(message.url);
      }
    });
  }

  // 重新计算所有图片的分组信息
  recalculateGroupInfo() {
    this.images.forEach((image, index) => {
      const groupIndex = Math.floor(index / 3);
      const indexInGroup = index % 3;
      const groupPrefix = `group_${groupIndex + 1}`;
      
      image.groupIndex = groupIndex;
      image.indexInGroup = indexInGroup;
      image.groupPrefix = groupPrefix;
      image.sequenceNumber = index + 1;
    });
  }

  async addImage(file) {
    if (!file.type.startsWith('image/')) {
      this.showStatus('请选择图片文件', 'error');
      return;
    }

    // 计算分组信息（每3个为一组）
    const groupIndex = Math.floor(this.images.length / 3);
    const indexInGroup = this.images.length % 3;
    const groupPrefix = `group_${groupIndex + 1}`;

    const imageData = {
      id: Date.now() + Math.random(),
      file: file,
      name: file.name,
      size: file.size,
      preview: await this.createPreview(file),
      processed: false,
      groupIndex: groupIndex,
      indexInGroup: indexInGroup,
      groupPrefix: groupPrefix,
      sequenceNumber: this.images.length + 1
    };

    this.images.push(imageData);
    this.renderImageList();
    this.updateUI();
    this.showStatus(`已添加: ${file.name} (组${groupIndex + 1}, 序号${indexInGroup + 1})`, 'success');
    
    // 如果启用了自动处理，自动处理这张图片
    if (this.settings.autoProcess) {
      // 延迟一下，确保UI更新完成
      setTimeout(() => {
        this.autoProcessImage(this.images.length - 1);
      }, 100);
    }
  }

  async autoProcessImage(index) {
    const image = this.images[index];
    if (!image || image.processed) {
      return;
    }

    const convertMode = document.getElementById('convertMode').value;
    
    // 检查是否需要设置尺寸
    if (convertMode === 'resize' && !this.currentSize) {
      this.showStatus('自动处理需要先设置图片尺寸', 'error');
      return;
    }

    // 自动处理图片
    this.showStatus(`自动处理中: ${image.name}`, 'processing');
    try {
      await this.resizeAndSaveImage(image.file, this.currentSize, image);
      image.processed = true;
      this.renderImageList();
      this.showStatus(`自动处理完成: ${image.name}`, 'success');
    } catch (error) {
      console.error('自动处理失败:', error);
      this.showStatus(`自动处理失败: ${image.name}`, 'error');
    }
  }

  deleteImage(index) {
    if (index < 0 || index >= this.images.length) {
      return;
    }

    const imageName = this.images[index].name;
    
    // 从数组中删除
    this.images.splice(index, 1);
    
    // 重新计算所有图片的分组信息
    this.recalculateGroupInfo();
    
    // 重新渲染列表
    this.renderImageList();
    this.updateUI();
    
    this.showStatus(`已删除: ${imageName}`, 'success');
  }

  async addImageFromURL(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const fileName = this.extractFileNameFromURL(url) || 'web_image.jpg';
      const file = new File([blob], fileName, { type: blob.type });
      await this.addImage(file);
    } catch (error) {
      this.showStatus('无法加载网页图片', 'error');
    }
  }

  extractFileNameFromURL(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      return pathname.substring(pathname.lastIndexOf('/') + 1);
    } catch {
      return 'web_image.jpg';
    }
  }

  async createPreview(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 50;
          canvas.height = 50;
          ctx.drawImage(img, 0, 0, 50, 50);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  renderImageList() {
    const imageList = document.getElementById('imageList');
    imageList.innerHTML = '';

    this.images.forEach((image, index) => {
      const item = document.createElement('div');
      item.className = 'image-item';
      // 如果是组的第一张图片，添加分组标识
      const groupLabel = image.indexInGroup === 0 ? `<div style="font-size: 10px; color: #4CAF50; font-weight: bold; margin-bottom: 2px;">组${image.groupIndex + 1}</div>` : '';
      item.innerHTML = `
        <img src="${image.preview}" class="image-preview" alt="预览">
        <div class="image-info">
          ${groupLabel}
          <div class="name">${image.name}</div>
          <div class="size">${this.formatFileSize(image.size)}</div>
          <div style="font-size: 10px; color: #666;">序号: ${image.sequenceNumber} | 组内: ${image.indexInGroup + 1}/3</div>
          <div class="status">${image.processed ? '✅ 已处理' : '⏳ 等待处理'}</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <button class="process-button" data-index="${index}">单独处理</button>
          <button class="delete-button" data-index="${index}">删除</button>
        </div>
      `;
      imageList.appendChild(item);
    });

    // 添加单独处理按钮事件
    document.querySelectorAll('.process-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.processSingleImage(index);
      });
    });

    // 添加删除按钮事件
    document.querySelectorAll('.delete-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.deleteImage(index);
      });
    });
  }

  updateUI() {
    const processAllButton = document.getElementById('processAll');
    const convertMode = document.getElementById('convertMode').value;
    // 如果选择仅转换格式，不需要设置尺寸
    const needsSize = convertMode === 'resize';
    processAllButton.disabled = this.images.length === 0 || (needsSize && !this.currentSize);
  }

  async processSingleImage(index) {
    const image = this.images[index];
    const convertMode = document.getElementById('convertMode').value;
    
    // 如果选择调整尺寸模式，需要先设置尺寸
    if (convertMode === 'resize' && !this.currentSize) {
      this.showStatus('请先设置图片尺寸', 'error');
      return;
    }
    
    this.showStatus(`处理中: ${image.name}`, 'processing');
    await this.resizeAndSaveImage(image.file, this.currentSize, image);
    
    image.processed = true;
    this.renderImageList();
    this.showStatus(`完成: ${image.name}`, 'success');
  }

  async processAllImages() {
    const convertMode = document.getElementById('convertMode').value;
    
    // 如果选择调整尺寸模式，需要先设置尺寸
    if (convertMode === 'resize' && !this.currentSize) {
      this.showStatus('请先设置图片尺寸', 'error');
      return;
    }
    
    this.showStatus(`开始批量处理 ${this.images.length} 张图片`, 'processing');
    
    for (let i = 0; i < this.images.length; i++) {
      const image = this.images[i];
      await this.resizeAndSaveImage(image.file, this.currentSize, image);
      image.processed = true;
      this.renderImageList();
    }
    
    this.showStatus(`已完成所有图片处理`, 'success');
  }

  async resizeAndSaveImage(file, size, imageData = null) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const convertMode = document.getElementById('convertMode').value;
        const outputFormat = document.getElementById('outputFormat').value;
        
        let targetWidth, targetHeight;
        
        // 根据转换模式决定尺寸
        if (convertMode === 'format_only') {
          // 仅转换格式，保持原尺寸
          targetWidth = img.width;
          targetHeight = img.height;
        } else {
          // 调整尺寸模式
          const keepAspect = document.getElementById('keepAspect').checked;
          targetWidth = size.width;
          targetHeight = size.height;
          
          if (keepAspect) {
            // 计算保持宽高比的尺寸
            const originalAspect = img.width / img.height;
            const targetAspect = size.width / size.height;
            
            if (originalAspect > targetAspect) {
              // 原图更宽，以宽度为准
              targetHeight = Math.round(size.width / originalAspect);
              targetWidth = size.width;
            } else {
              // 原图更高，以高度为准
              targetWidth = Math.round(size.height * originalAspect);
              targetHeight = size.height;
            }
          }
        }
        
        // 设置画布尺寸
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // 绘制图片
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // 确定输出格式和MIME类型
        let mimeType = file.type || 'image/jpeg';
        let quality = 0.9;
        
        if (outputFormat !== 'original') {
          switch (outputFormat) {
            case 'jpeg':
              mimeType = 'image/jpeg';
              quality = 0.9;
              break;
            case 'png':
              mimeType = 'image/png';
              quality = undefined; // PNG不支持quality参数
              break;
            case 'webp':
              mimeType = 'image/webp';
              quality = 0.9;
              break;
          }
        }
        
          // 转换为Blob
        const toBlobOptions = mimeType === 'image/png' ? [mimeType] : [mimeType, quality];
        canvas.toBlob(async (blob) => {
          // 生成文件名（传入图片数据以获取分组信息）
          const fileName = this.generateFileName(file.name, size, outputFormat, imageData);
          
          // 获取保存文件夹路径
          const folderPath = this.settings.selectedFolderPath || this.settings.saveFolder || '';
          const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
          
          // 将blob转换为base64
          const reader = new FileReader();
          reader.onload = async () => {
            const base64Data = reader.result.split(',')[1];
            const dataUrl = reader.result;
            
            try {
              // 使用Chrome downloads API下载文件
              await chrome.downloads.download({
                url: dataUrl,
                filename: fullPath,
                saveAs: false
              });
              resolve();
            } catch (err) {
              // 如果downloads API失败，降级使用a标签下载
              console.warn('使用downloads API失败，降级使用a标签:', err);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              resolve();
            }
          };
          reader.readAsDataURL(blob);
        }, ...toBlobOptions);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  generateFileName(originalName, size, outputFormat, imageData = null) {
    const convertMode = document.getElementById('convertMode').value;
    
    // 确定文件扩展名
    let extension;
    if (outputFormat === 'original') {
      extension = originalName.split('.').pop();
    } else {
      extension = outputFormat;
    }
    
    // 生成文件名：组号（组内序号）
    let fileName = '';
    
    if (imageData) {
      // 组号（从1开始）
      const groupNumber = imageData.groupIndex + 1;
      // 组内序号（001, 002, 003）
      const indexInGroup = String(imageData.indexInGroup + 1).padStart(3, '0');
      // 格式：组号（组内序号）
      fileName = `${groupNumber}（${indexInGroup}）`;
    } else {
      // 如果没有图片数据，使用时间戳
      fileName = `image_${Date.now()}`;
    }
    
    // 不添加尺寸信息，直接返回文件名
    return `${fileName}.${extension}`;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    if (type !== 'processing') {
      setTimeout(() => {
        status.style.display = 'none';
      }, 3000);
    }
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new ImageResizer();
});