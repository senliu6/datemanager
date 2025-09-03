// 全局上传管理器 - 独立于组件生命周期
import axios from '../util/axios';

class UploadManager {
    constructor() {
        this.uploadQueue = [];
        this.activeUploads = new Map();
        this.abortControllers = new Map();
        this.completedFiles = [];
        this.failedFiles = [];
        this.uploadProgress = {};
        this.currentSessionId = null;
        this.isPaused = false;
        this.batchSize = 8;
        this.listeners = new Set();

        // 从 sessionStorage 恢复状态
        this.restoreState();

        // 定期保存状态
        setInterval(() => this.saveState(), 5000);
    }

    // 添加状态监听器
    addListener(callback) {
        this.listeners.add(callback);
        // 立即调用一次以获取当前状态
        callback(this.getStats());
    }

    // 移除状态监听器
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    // 通知所有监听器
    notifyListeners() {
        const stats = this.getStats();
        this.listeners.forEach(callback => {
            try {
                callback(stats);
            } catch (error) {
                console.error('监听器回调错误:', error);
            }
        });
    }

    // 获取统计信息
    getStats() {
        const total = this.uploadQueue.length + this.activeUploads.size + this.completedFiles.length + this.failedFiles.length;
        const completed = this.completedFiles.length;
        const failed = this.failedFiles.length;
        const uploading = this.activeUploads.size;
        const queued = this.uploadQueue.length;

        return {
            total,
            completed,
            failed,
            uploading,
            queued,
            progress: this.calculateProgress(total, completed),
            currentSessionId: this.currentSessionId,
            isPaused: this.isPaused,
            batchSize: this.batchSize
        };
    }
    // 计算总体进度
    calculateProgress(total, completed) {
        if (total === 0) return 0;
        const completedProgress = completed * 100;
        const currentProgress = Object.values(this.uploadProgress).reduce((sum, progress) => sum + progress, 0);
        return Math.round((completedProgress + currentProgress) / total);
    }

    // 保存状态到 sessionStorage
    saveState() {
        const state = {
            currentSessionId: this.currentSessionId,
            isPaused: this.isPaused,
            batchSize: this.batchSize,
            queuedFiles: this.uploadQueue.map(file => ({
                uid: file.uid,
                name: file.name,
                size: file.size,
                type: file.type,
                status: file.status,
                folderPath: file.folderPath
            })),
            completedFiles: this.completedFiles.map(file => ({
                uid: file.uid,
                name: file.name,
                size: file.size,
                type: file.type,
                status: file.status
            })),
            failedFiles: this.failedFiles.map(file => ({
                uid: file.uid,
                name: file.name,
                size: file.size,
                type: file.type,
                status: file.status,
                error: file.error,
                failedAt: file.failedAt
            }))
        };
        sessionStorage.setItem('uploadManagerState', JSON.stringify(state));
    }

    // 从 sessionStorage 恢复状态
    restoreState() {
        try {
            const savedState = sessionStorage.getItem('uploadManagerState');
            if (savedState) {
                const state = JSON.parse(savedState);
                this.currentSessionId = state.currentSessionId;
                this.isPaused = state.isPaused || false;
                this.batchSize = state.batchSize || 8;
                this.completedFiles = state.completedFiles || [];
                this.failedFiles = state.failedFiles || [];

                // 将未完成的文件标记为失败（因为File对象丢失）
                if (state.queuedFiles && state.queuedFiles.length > 0) {
                    const lostFiles = state.queuedFiles.map(file => ({
                        ...file,
                        error: '页面刷新后文件对象丢失，请重新选择文件上传',
                        failedAt: new Date().toLocaleString()
                    }));
                    this.failedFiles.push(...lostFiles);
                }
            }
        } catch (error) {
            console.error('恢复上传状态失败:', error);
        }
    }
    // 添加文件到上传队列
    addFiles(files, sessionId, defaultFolderPath = '未分类') {
        // 如果是新的会话，清理之前的上传状态
        if (this.currentSessionId !== sessionId) {
            this.clearCurrentSession();
        }

        this.currentSessionId = sessionId;
        const processedFiles = files.map(file => {
            // 优先使用文件的webkitRelativePath来确定文件夹路径
            let fileFolderPath = defaultFolderPath;

            if (file.webkitRelativePath) {
                // 如果有相对路径，使用路径的目录部分
                const pathParts = file.webkitRelativePath.split('/');
                if (pathParts.length > 1) {
                    // 移除文件名，保留目录路径
                    pathParts.pop();
                    fileFolderPath = pathParts.join('/');
                }
            }

            return {
                uid: `file-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                name: file.name,
                size: file.size,
                type: file.type,
                originFileObj: file,
                status: 'queued',
                folderPath: fileFolderPath
            };
        });

        this.uploadQueue.push(...processedFiles);
        this.saveState();
        this.notifyListeners();
        this.processQueue();

        return processedFiles.length;
    }

    // 处理上传队列
    async processQueue() {
        if (this.isPaused) return;

        while (this.uploadQueue.length > 0 && this.activeUploads.size < this.batchSize && !this.isPaused) {
            const fileItem = this.uploadQueue.shift();
            if (!fileItem) continue;

            this.activeUploads.set(fileItem.uid, fileItem);
            this.uploadSingleFile(fileItem);
        }
    }

    // 上传单个文件
    async uploadSingleFile(fileItem) {
        const abortController = new AbortController();
        this.abortControllers.set(fileItem.uid, abortController);

        try {
            if (!fileItem.originFileObj || !(fileItem.originFileObj instanceof File)) {
                throw new Error('无效的文件对象');
            }

            const formData = new FormData();
            formData.append('file', fileItem.originFileObj);
            formData.append('folderPath', fileItem.folderPath || '未分类');

            const response = await axios.post('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: abortController.signal,
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    this.uploadProgress[fileItem.uid] = percentCompleted;
                    this.notifyListeners();
                },
            });

            if (response.data.success) {
                this.completedFiles.push(fileItem);
                delete this.uploadProgress[fileItem.uid];
            } else {
                throw new Error(response.data.message || '上传失败');
            }

        } catch (error) {
            if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
                // 被取消的文件重新放回队列
                this.uploadQueue.unshift(fileItem);
                delete this.uploadProgress[fileItem.uid];
            } else {
                let errorMessage = error.message;
                if (error.response?.data?.message) {
                    errorMessage = error.response.data.message;
                }

                this.failedFiles.push({
                    ...fileItem,
                    error: errorMessage,
                    failedAt: new Date().toLocaleString()
                });
                delete this.uploadProgress[fileItem.uid];
            }
        } finally {
            this.activeUploads.delete(fileItem.uid);
            this.abortControllers.delete(fileItem.uid);
            this.saveState();
            this.notifyListeners();

            // 检查是否所有文件都已完成，如果是则更新上传记录状态
            this.checkAndUpdateSessionStatus();

            // 继续处理队列
            if (!this.isPaused) {
                setTimeout(() => this.processQueue(), 10);
            }
        }
    }
    // 暂停上传
    pause() {
        this.isPaused = true;
        this.abortControllers.forEach(controller => {
            try {
                controller.abort();
            } catch (error) {
                console.warn('取消上传请求失败:', error);
            }
        });
        this.saveState();
        this.notifyListeners();
    }

    // 恢复上传
    resume() {
        this.isPaused = false;
        this.saveState();
        this.notifyListeners();
        this.processQueue();
    }

    // 重试失败的文件
    retryFailed() {
        const retryableFiles = this.failedFiles.filter(f => f.originFileObj);
        const nonRetryableFiles = this.failedFiles.filter(f => !f.originFileObj);

        if (retryableFiles.length === 0) {
            return { success: false, message: '无法重试失败的文件，因为原始文件对象已丢失' };
        }

        this.failedFiles = nonRetryableFiles;
        this.uploadQueue.push(...retryableFiles.map(f => ({ ...f, status: 'queued' })));
        this.saveState();
        this.notifyListeners();
        this.processQueue();

        return {
            success: true,
            message: `开始重试 ${retryableFiles.length} 个失败的文件`,
            retryCount: retryableFiles.length,
            skippedCount: nonRetryableFiles.length
        };
    }

    // 清除当前会话的上传状态（但保留sessionStorage）
    clearCurrentSession() {
        this.abortControllers.forEach(controller => {
            try {
                controller.abort();
            } catch (error) {
                console.warn('取消上传请求失败:', error);
            }
        });

        this.uploadQueue = [];
        this.activeUploads.clear();
        this.abortControllers.clear();
        this.completedFiles = [];
        this.failedFiles = [];
        this.uploadProgress = {};
        this.isPaused = false;

        this.notifyListeners();
    }

    // 清除所有文件
    clearAll() {
        this.clearCurrentSession();
        this.currentSessionId = null;
        sessionStorage.removeItem('uploadManagerState');
        this.notifyListeners();
    }

    // 设置批处理大小
    setBatchSize(size) {
        this.batchSize = size;
        this.saveState();
        this.notifyListeners();
    }

    // 检查并更新会话状态
    async checkAndUpdateSessionStatus() {
        if (!this.currentSessionId) return;

        // 检查是否所有文件都已完成（成功或失败）
        const isAllCompleted = this.uploadQueue.length === 0 && this.activeUploads.size === 0;

        if (isAllCompleted) {
            try {
                const totalFiles = this.completedFiles.length + this.failedFiles.length;
                const completedFiles = this.completedFiles.length;
                const failedFiles = this.failedFiles.length;

                // 计算已完成文件的大小
                const completedSize = this.completedFiles
                    .reduce((sum, file) => sum + (file.size || 0), 0);

                const status = failedFiles > 0 ? 'completed_with_errors' : 'completed';

                await axios.put(`/api/upload-records/session/${this.currentSessionId}`, {
                    status: status,
                    completed_files: completedFiles,
                    failed_files: failedFiles,
                    completed_size: completedSize,
                    end_time: new Date().toISOString(),
                    notes: `上传完成：成功 ${completedFiles} 个，失败 ${failedFiles} 个`
                });

                console.log(`会话 ${this.currentSessionId} 状态已更新为 ${status}`);
            } catch (error) {
                console.error('更新上传记录状态失败:', error);
            }
        }
    }
}

// 创建全局实例
const uploadManager = new UploadManager();

export default uploadManager;