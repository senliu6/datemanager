// Web Worker for file processing
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    if (type === 'PROCESS_FILES') {
        processFiles(data.items);
    }
};

async function processFiles(items) {
    const files = [];
    let processedCount = 0;
    
    const processEntry = async (entry, path = '') => {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file((file) => {
                    const relativePath = path ? `${path}/${file.name}` : file.name;
                    
                    // 发送文件信息到主线程
                    self.postMessage({
                        type: 'FILE_FOUND',
                        data: {
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            relativePath: relativePath,
                            lastModified: file.lastModified
                        }
                    });
                    
                    processedCount++;
                    
                    // 每100个文件报告一次进度
                    if (processedCount % 100 === 0) {
                        self.postMessage({
                            type: 'PROGRESS',
                            data: { processed: processedCount }
                        });
                    }
                    
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            return new Promise((resolve) => {
                const readEntries = async () => {
                    dirReader.readEntries(async (entries) => {
                        if (entries.length === 0) {
                            resolve();
                            return;
                        }

                        for (const childEntry of entries) {
                            const childPath = path ? `${path}/${entry.name}` : entry.name;
                            await processEntry(childEntry, childPath);
                        }
                        
                        await readEntries();
                    });
                };
                readEntries();
            });
        }
    };

    try {
        for (const item of items) {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                await processEntry(entry);
            }
        }
        
        self.postMessage({
            type: 'COMPLETE',
            data: { totalProcessed: processedCount }
        });
        
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            data: { error: error.message }
        });
    }
}