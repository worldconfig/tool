// 内容脚本：为网页图片添加拖拽支持
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG') {
    // 设置拖拽数据
    e.dataTransfer.setData('text/uri-list', e.target.src);
    e.dataTransfer.setData('text/plain', e.target.src);
    
    // 添加拖拽效果
    e.dataTransfer.effectAllowed = 'copy';
    
    // 可以在这里添加自定义的拖拽图像
    // const dragImage = document.createElement('div');
    // dragImage.textContent = '拖拽到侧边栏调整尺寸';
    // document.body.appendChild(dragImage);
    // e.dataTransfer.setDragImage(dragImage, 10, 10);
    // setTimeout(() => document.body.removeChild(dragImage), 0);
  }
});

// 为图片添加拖拽提示
function addDragHint(img) {
  if (img.dataset.dragHintAdded) return;
  
  img.title = '拖拽此图片到扩展侧边栏调整尺寸喵~';
  img.style.cursor = 'grab';
  
  img.addEventListener('dragstart', () => {
    img.style.opacity = '0.7';
  });
  
  img.addEventListener('dragend', () => {
    img.style.opacity = '1';
  });
  
  img.dataset.dragHintAdded = 'true';
}

// 监听图片加载
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.tagName === 'IMG') {
        addDragHint(node);
      } else if (node.querySelectorAll) {
        node.querySelectorAll('img').forEach(addDragHint);
      }
    });
  });
});

// 开始观察（监听）
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// 为现有图片添加提示
document.querySelectorAll('img').forEach(addDragHint);