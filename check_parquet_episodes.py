#!/usr/bin/env python3

import pandas as pd
import os

def check_parquet_episodes():
    """检查parquet文件中的episode_index"""
    
    uploads_dir = "/home/sen/gitee/datemanager/Uploads"
    parquet_files = [f for f in os.listdir(uploads_dir) if f.endswith('.parquet')]
    parquet_files.sort()
    
    print("🔍 检查parquet文件中的episode_index...")
    print("=" * 60)
    
    for i, filename in enumerate(parquet_files):
        file_path = os.path.join(uploads_dir, filename)
        
        try:
            df = pd.read_parquet(file_path)
            episode_index = df['episode_index'].iloc[0] if 'episode_index' in df.columns else 'N/A'
            frame_count = len(df)
            
            print(f"文件 {i}: {filename}")
            print(f"  Episode Index: {episode_index}")
            print(f"  Frame Count: {frame_count}")
            print(f"  Generated Key: episode_{int(episode_index):06d}" if episode_index != 'N/A' else "  Generated Key: N/A")
            print(f"  Columns: {list(df.columns)}")
            print()
            
        except Exception as e:
            print(f"文件 {i}: {filename} - 读取失败: {e}")
            print()

if __name__ == "__main__":
    check_parquet_episodes()