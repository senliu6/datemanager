#!/usr/bin/env python3

import os
import ffmpeg
import logging

def get_video_duration(file_path: str) -> float:
    """获取视频文件的时长（秒）"""
    try:
        probe = ffmpeg.probe(file_path)
        duration = float(probe['format']['duration'])
        return duration
    except ffmpeg.Error as e:
        logging.error(f"Error probing video {file_path}: {e.stderr.decode()}")
        return 0.0
    except FileNotFoundError:
        logging.error(f"Video file not found: {file_path}")
        return 0.0

def check_video_durations():
    """检查所有视频文件的时长"""
    
    uploads_dir = "/home/sen/gitee/datemanager/Uploads"
    video_files = [f for f in os.listdir(uploads_dir) if f.endswith(('.mp4', '.mov'))]
    video_files.sort()
    
    print("🎬 检查视频文件时长...")
    print("=" * 80)
    
    durations = {}
    
    for filename in video_files[:15]:  # 只检查前15个文件
        file_path = os.path.join(uploads_dir, filename)
        duration = get_video_duration(file_path)
        durations[filename] = duration
        
        print(f"{filename}: {duration:.3f}s")
    
    # 统计时长分布
    unique_durations = list(set(durations.values()))
    unique_durations.sort()
    
    print(f"\n📊 时长统计:")
    print(f"总视频文件数: {len(video_files)}")
    print(f"检查的文件数: {min(15, len(video_files))}")
    print(f"不同时长数: {len(unique_durations)}")
    print(f"时长范围: {min(unique_durations):.3f}s - {max(unique_durations):.3f}s")
    
    # 显示时长分布
    for duration in unique_durations:
        count = sum(1 for d in durations.values() if abs(d - duration) < 0.1)
        print(f"  {duration:.3f}s: {count} 个文件")

if __name__ == "__main__":
    check_video_durations()