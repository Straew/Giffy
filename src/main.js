const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');

// Set FFmpeg path - HANDLES BOTH DEVELOPMENT AND PRODUCTION
function getFfmpegPath() {
  if (app.isPackaged) {
    // In production, ffmpeg is in extraResources
    const ffmpegPath = path.join(process.resourcesPath, 'ffmpeg.exe');
    console.log('Looking for FFmpeg at:', ffmpegPath);
    
    if (fs.existsSync(ffmpegPath)) {
      console.log('Found FFmpeg in production:', ffmpegPath);
      return ffmpegPath;
    } else {
      console.error('FFmpeg not found in production at:', ffmpegPath);
      // Fallback to trying the original path
      return ffmpegStatic;
    }
  } else {
    // In development, use the normal path
    console.log('Using development FFmpeg path:', ffmpegStatic);
    return ffmpegStatic;
  }
}

// Set FFmpeg path
const ffmpegPath = getFfmpegPath();
console.log('Final FFmpeg path:', ffmpegPath);
ffmpeg.setFfmpegPath(ffmpegPath);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 600,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false,
    title: "Giffy - Video to GIF Converter"
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

// IPC Handlers
ipcMain.handle('convert-video', async (event, options) => {
  return new Promise((resolve, reject) => {
    const { inputPath, outputPath, fps, scale, startTime, duration } = options;
    
    console.log('Starting conversion with FFmpeg path:', ffmpegPath);
    console.log('Input path:', inputPath);
    console.log('Output path:', outputPath);
    
    // Verify FFmpeg exists
    if (!fs.existsSync(ffmpegPath)) {
      const error = `FFmpeg not found at: ${ffmpegPath}`;
      console.error(error);
      reject(error);
      return;
    }
    
    let command = ffmpeg(inputPath);
    
    // Apply video filters
    const filters = [`fps=${fps}`, `scale=${scale}:-1:flags=lanczos`];
    command.videoFilters(filters);

    // Set output
    command.output(outputPath);
    command.outputFormat('gif');

    // Optional time settings
    if (startTime) {
      command.setStartTime(startTime);
    }
    if (duration) {
      command.setDuration(duration);
    }

    // Progress updates
    command.on('progress', (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('conversion-progress', {
          percent: Math.round(progress.percent) || 0,
          time: progress.timemark
        });
      }
    });

    command.on('end', () => {
      console.log('Conversion completed successfully');
      resolve({ 
        success: true, 
        outputPath,
        message: 'GIF created successfully!' 
      });
    });

    command.on('error', (error) => {
      console.error('Conversion error:', error);
      reject(`Conversion failed: ${error.message}`);
    });

    command.on('stderr', (stderrLine) => {
      console.log('FFmpeg output:', stderrLine);
    });

    command.run();
  });
});

ipcMain.handle('select-video', async () => {
  console.log('Video selection triggered');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { 
        name: 'Video Files', 
        extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', '3gp'] 
      }
    ]
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('save-gif', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'GIF Images', extensions: ['gif'] }
    ],
    defaultPath: `converted-${Date.now()}.gif`
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePath;
});

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});