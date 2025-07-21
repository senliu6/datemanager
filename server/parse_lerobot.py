import os
import json
import argparse
import pandas as pd
import numpy as np
import ffmpeg
from typing import List, Tuple, Dict, Any
import logging
from joblib import Parallel, delayed
import time


# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_video_duration(file_path: str) -> float:
    """获取视频文件的时长（秒）"""
    try:
        probe = ffmpeg.probe(file_path)
        duration = float(probe['format']['duration'])
        logging.info(f"Video {file_path} duration: {duration}s")
        return duration
    except ffmpeg.Error as e:
        logging.error(f"Error probing video {file_path}: {e.stderr.decode()}")
        return 0.0
    except FileNotFoundError:
        logging.error(f"Video file not found: {file_path}")
        return 0.0

def format_pointcloud_data(pointcloud_data: np.ndarray, max_points: int = 500) -> List[List[float]]:
    """格式化点云数据，随机选择最多 max_points 个点"""
    try:
        logging.info(f"Formatting pointcloud data with shape: {pointcloud_data.shape}")
        # 验证输入数据
        if pointcloud_data is None or not isinstance(pointcloud_data, np.ndarray):
            logging.error("Pointcloud data is None or not a NumPy array")
            return []

        # 处理展平的点云数据
        if len(pointcloud_data.shape) == 1 and pointcloud_data.size >= 3:
            if pointcloud_data.size % 3 == 0:
                pointcloud_data = pointcloud_data.reshape(-1, 3)
            else:
                logging.error(f"Pointcloud data size {pointcloud_data.size} is not divisible by 3")
                return []

        # 确保点云数据是 (N, 3) 形状
        if len(pointcloud_data.shape) != 2 or pointcloud_data.shape[1] != 3:
            logging.error(f"Invalid pointcloud shape: {pointcloud_data.shape}, expected (N, 3)")
            return []

        # 过滤有效点
        valid_points = pointcloud_data[np.all(np.isfinite(pointcloud_data), axis=1)]
        if len(valid_points) == 0:
            logging.error("No valid points in pointcloud data after filtering")
            return []

        # 随机降采样
        if len(valid_points) <= max_points:
            formatted_points = valid_points.tolist()
        else:
            indices = np.random.choice(len(valid_points), size=max_points, replace=False)
            formatted_points = valid_points[indices].tolist()

        # 计算点云统计信息
        mean = np.mean(valid_points, axis=0).tolist() if len(valid_points) > 0 else [0, 0, 0]
        std = np.std(valid_points, axis=0).tolist() if len(valid_points) > 0 else [0, 0, 0]
        logging.info(f"Formatted {len(formatted_points)} points from pointcloud, mean={mean}, std={std}, sample={formatted_points[:3] if formatted_points else []}")
        return formatted_points
    except Exception as e:
        logging.error(f"Error formatting pointcloud data: {e}")
        return []

def parse_lerobot_data(files: List[Tuple[str, str]], folder_path: str, max_frames: int = None, max_points: int = None) -> List[Dict[str, Any]]:
    episodes = []
    base_folder = folder_path.replace('\\', '/')
    logging.info(f"Starting parsing {len(files)} files, folderPath: {base_folder}")

    for file_path, original_name in files:
        logging.info(f"Processing file: {file_path} (originalName: {original_name})")
        try:
            # 验证 Parquet 文件
            df = pd.read_parquet(file_path, engine='pyarrow')
            logging.info(f"Successfully read Parquet file: {file_path}, rows: {len(df)}, columns: {list(df.columns)}")

            # 检查列名（处理可能的拼写错误，如 fra_index 或 fre_index）
            if 'fra_index' in df.columns:
                logging.info("Found 'fra_index' in columns, assuming typo for 'frame_index'")
                df = df.rename(columns={'fra_index': 'frame_index'})
            elif 'fre_index' in df.columns:
                logging.info("Found 'fre_index' in columns, assuming typo for 'frame_index'")
                df = df.rename(columns={'fre_index': 'frame_index'})

            # 提取 episode 索引
            if 'episode_index' not in df.columns:
                logging.error(f"'episode_index' column not found in {file_path}")
                continue
            episode_index = df['episode_index'].iloc[0]
            key = f"episode_{int(episode_index):06d}"

            # 获取视频路径
            video_extensions = ['.mp4', '.mov']
            video_paths = {
                'cam_cam_top': None,
                'cam_cam_right_wrist': None,
                'cam_cam_right_gripper_left_tactile': None
            }
            for cam_key in video_paths.keys():
                for ext in video_extensions:
                    video_file = f"{base_folder}/{cam_key}/{key}{ext}"
                    abs_video_path = f"/home/sen/gitee/datemanager/Uploads/{os.path.basename(video_file)}"
                    if os.path.exists(abs_video_path):
                        video_paths[cam_key] = abs_video_path
                        logging.info(f"Found video for {cam_key}: {abs_video_path}")
                    else:
                        logging.warning(f"Video file not found: {abs_video_path}")

            # 获取视频时长
            video_duration = 0.0
            for video_path in video_paths.values():
                if video_path:
                    duration = get_video_duration(video_path)
                    video_duration = max(video_duration, duration)
            logging.info(f"Max video duration for {key}: {video_duration}s")

            # 动态限制帧数
            original_frame_count = len(df)
            if max_frames is None:
                # 根据数据量自动调整
                if original_frame_count <= 2000:
                    max_frames = original_frame_count  # 小数据集不降采样
                elif original_frame_count <= 5000:
                    max_frames = 2000  # 中等数据集适度降采样
                else:
                    max_frames = 3000  # 大数据集保留更多数据

            if max_frames >= original_frame_count:
                # 不需要降采样
                frame_step = 1
                logging.info(f"No frame downsampling needed, using all {original_frame_count} frames")
            else:
                frame_step = max(1, original_frame_count // max_frames)
                df = df.iloc[::frame_step][:max_frames]
                logging.info(f"Downsampling from {original_frame_count} to {max_frames} frames with step {frame_step}, actual rows: {len(df)}")

            # 提取时间戳并归一化
            if 'timestamp' not in df.columns:
                logging.warning(f"No 'timestamp' column in {file_path}, using linear timestamps")
                timestamps = np.arange(len(df)) * (video_duration / max_frames if video_duration > 0 else 1.0)
            else:
                timestamps = df['timestamp'].to_numpy()
                logging.info(f"Raw timestamps: min={np.min(timestamps):.2f}, max={np.max(timestamps):.2f}")

            if len(timestamps) == 0:
                logging.warning(f"No timestamps found in {file_path}")
                continue

            min_time, max_time = np.min(timestamps), np.max(timestamps)
            if max_time > min_time:
                normalized_timestamps = [(t - min_time) / (max_time - min_time) * video_duration for t in timestamps]
            else:
                logging.warning(f"Timestamps are identical or invalid (min={min_time}, max={max_time}), using linear timestamps")
                normalized_timestamps = [i * (video_duration / max_frames) for i in range(len(df))]
            logging.info(f"Normalized timestamps: min={min(normalized_timestamps):.2f}, max={max(normalized_timestamps):.2f}")

            # 提取 action 数据
            if 'action' not in df.columns:
                logging.error(f"'action' column not found in {file_path}")
                continue
            action_data = [list(map(float, np.array(a))) for a in df['action']]
            logging.info(f"Extracted action column: length={len(action_data)}, sample={action_data[:2]}")

            # 提取点云数据
            if 'observation.pointcloud.cam_top' not in df.columns or 'observation.pointcloud.cam_right_wrist' not in df.columns:
                logging.error(f"Pointcloud columns missing in {file_path}")
                cam_top_points = [[]] * len(df)
                cam_right_wrist_points = [[]] * len(df)
            else:
                start_time = time.time()

                raw_top = df['observation.pointcloud.cam_top'].tolist()
                raw_wrist = df['observation.pointcloud.cam_right_wrist'].tolist()

                # 动态调整点云采样数量
                if max_points is None:
                    # 根据帧数自动调整点云密度
                    if len(df) <= 1000:
                        points_per_frame = 2000  # 小数据集保留更多点云
                    elif len(df) <= 2000:
                        points_per_frame = 1500  # 中等数据集适度采样
                    else:
                        points_per_frame = 1000  # 大数据集保持原有采样
                else:
                    points_per_frame = max_points

                logging.info(f"Using {points_per_frame} points per frame for pointcloud data")

                cam_top_points = Parallel(n_jobs=4)(
                    delayed(safe_format_pointcloud_data)(pc, points_per_frame) for pc in raw_top
                )
                cam_right_wrist_points = Parallel(n_jobs=4)(
                    delayed(safe_format_pointcloud_data)(pc, points_per_frame) for pc in raw_wrist
                )

                logging.info(f"Pointcloud sampling complete - top: {len(cam_top_points)} frames, wrist: {len(cam_right_wrist_points)} frames, took {time.time() - start_time:.2f}s")

                # 验证帧间点云差异
                for i in [0, 100, 200]:
                    if i < len(cam_top_points) and cam_top_points[i]:
                        mean = np.mean(cam_top_points[i], axis=0).tolist() if cam_top_points[i] else [0, 0, 0]
                        std = np.std(cam_top_points[i], axis=0).tolist() if cam_top_points[i] else [0, 0, 0]
                        logging.info(f"cam_top frame {i}: length={len(cam_top_points[i])}, mean={mean}, std={std}, sample={cam_top_points[i][:3]}")
                    if i < len(cam_right_wrist_points) and cam_right_wrist_points[i]:
                        mean = np.mean(cam_right_wrist_points[i], axis=0).tolist() if cam_right_wrist_points[i] else [0, 0, 0]
                        std = np.std(cam_right_wrist_points[i], axis=0).tolist() if cam_right_wrist_points[i] else [0, 0, 0]
                        logging.info(f"cam_right_wrist frame {i}: length={len(cam_right_wrist_points[i])}, mean={mean}, std={std}, sample={cam_right_wrist_points[i][:3]}")

            episode = {
                'key': key,
                'index': int(episode_index),
                'folderPath': base_folder,
                'frame_count': len(df),
                'video_paths': video_paths,
                'motor_data': {
                    'time': normalized_timestamps,
                    'motors': action_data
                },
                'pointcloud_data': {
                    'cam_top': cam_top_points,
                    'cam_right_wrist': cam_right_wrist_points
                }
            }
            episodes.append(episode)
            logging.info(f"Successfully generated episode: {key}")
        except Exception as e:
            logging.error(f"Error processing {file_path}: {e}")
            continue

    logging.info(f"Parsing completed, generated {len(episodes)} episodes")
    return episodes

def convert_to_serializable(obj):
    """递归地将 NumPy 类型转换为原生 Python 类型，确保 JSON 可序列化"""
    if isinstance(obj, dict):
        return {k: convert_to_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_serializable(i) for i in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    else:
        return obj

def main():
    parser = argparse.ArgumentParser(description='Parse LeRobot dataset files.')
    parser.add_argument('--files', nargs='+', required=True, help='List of files to parse with original names (format: path:original_name)')
    parser.add_argument('--folderPath', type=str, required=True, help='Base folder path for video files')
    parser.add_argument('--max-frames', type=int, default=None, help='Maximum number of frames to process per episode (default: auto)')
    parser.add_argument('--max-points', type=int, default=None, help='Maximum number of points per frame in pointcloud (default: auto)')
    parser.add_argument('--quality', type=str, choices=['low', 'medium', 'high', 'full'], default='medium',
                        help='Data quality preset: low(fast), medium(balanced), high(detailed), full(no sampling)')
    args = parser.parse_args()

    # 根据质量预设调整参数
    if args.quality == 'low':
        max_frames = args.max_frames or 300
        max_points = args.max_points or 300
    elif args.quality == 'medium':
        max_frames = args.max_frames or 800
        max_points = args.max_points or 600
    elif args.quality == 'high':
        max_frames = args.max_frames or 1500
        max_points = args.max_points or 1000
    elif args.quality == 'full':
        max_frames = args.max_frames  # None = 无限制，使用原始数据
        max_points = args.max_points  # None = 无限制，使用原始点云
    else:
        max_frames = args.max_frames
        max_points = args.max_points

    logging.info(f"Using quality preset: {args.quality}, max_frames: {max_frames}, max_points: {max_points}")

    files = [tuple(f.split(':')) for f in args.files]
    episodes = parse_lerobot_data(files, args.folderPath, max_frames, max_points)

    # ✅ 优化数据输出，减少传输量
    try:
        serializable_episodes = convert_to_serializable(episodes)

        # 智能数据大小管理
        # 先估算数据大小，避免生成过大的JSON
        estimated_size = 0
        for episode in serializable_episodes:
            # 估算每个episode的大小
            frame_count = episode.get('frame_count', 0)
            pointcloud_frames = len(episode.get('pointcloud_data', {}).get('cam_top', []))
            avg_points_per_frame = len(episode.get('pointcloud_data', {}).get('cam_top', [{}])[0]) if pointcloud_frames > 0 else 0

            # 估算大小：每个点约12字节（3个float），加上其他数据
            estimated_episode_size = (pointcloud_frames * avg_points_per_frame * 12 * 2) + (frame_count * 100)  # 2个相机，额外数据
            estimated_size += estimated_episode_size

        estimated_mb = estimated_size / 1024 / 1024
        logging.info(f"Estimated data size: {estimated_mb:.2f} MB")

        # 如果估算大小超过400MB，进行智能压缩
        if estimated_mb > 400:
            logging.warning(f"Data size too large ({estimated_mb:.2f} MB), applying smart compression...")

            # 根据质量级别进行不同程度的压缩
            if args.quality == 'full':
                # 完整质量：只压缩到合理大小，保持高质量
                compression_factor = max(1, int(estimated_mb / 300))  # 目标300MB
                logging.info(f"Full quality compression factor: {compression_factor}")
            else:
                # 其他质量：更激进的压缩
                compression_factor = max(2, int(estimated_mb / 200))  # 目标200MB
                logging.info(f"Standard compression factor: {compression_factor}")

            compressed_episodes = []
            for episode in serializable_episodes:
                compressed_episode = {
                    'key': episode['key'],
                    'index': episode['index'],
                    'folderPath': episode['folderPath'],
                    'frame_count': episode['frame_count'],
                    'video_paths': episode['video_paths'],
                    'motor_data': {
                        'time': episode['motor_data']['time'][::compression_factor],
                        'motors': episode['motor_data']['motors'][::compression_factor]
                    },
                    'pointcloud_data': {
                        'cam_top': [frame[::compression_factor] for frame in episode['pointcloud_data']['cam_top'][::compression_factor]],
                        'cam_right_wrist': [frame[::compression_factor] for frame in episode['pointcloud_data']['cam_right_wrist'][::compression_factor]]
                    }
                }
                compressed_episodes.append(compressed_episode)

            serializable_episodes = compressed_episodes
            logging.info(f"Applied compression factor {compression_factor}")

        # 生成最终JSON
        json_str = json.dumps(serializable_episodes)
        final_size_mb = len(json_str) / 1024 / 1024
        logging.info(f"Final JSON size: {final_size_mb:.2f} MB")

        # 如果还是太大，进行最后的安全检查
        if final_size_mb > 450:  # Node.js字符串限制约512MB
            logging.error(f"Data still too large ({final_size_mb:.2f} MB), cannot process safely")
            print(json.dumps({"error": f"Data too large ({final_size_mb:.2f} MB), please use lower quality setting", "episodes": []}))
        else:
            print(json_str)
    except Exception as e:
        logging.error(f"Error serializing episodes to JSON: {e}")
        # 输出错误信息而不是崩溃
        print(json.dumps({"error": str(e), "episodes": []}))

def safe_format_pointcloud_data(raw_pc, max_points=1000):
    try:
        pc_array = np.array(raw_pc)
        if pc_array.ndim == 1 and pc_array.size % 3 == 0:
            pc_array = pc_array.reshape(-1, 3)
        if pc_array.shape[1] != 3:
            return []
        valid = pc_array[np.all(np.isfinite(pc_array), axis=1)]
        if valid.shape[0] == 0:
            return []
        if valid.shape[0] > max_points:
            indices = np.random.choice(len(valid), size=max_points, replace=False)
            return valid[indices].tolist()
        return valid.tolist()
    except Exception as e:
        logging.warning(f"Safe pointcloud format failed: {e}")
        return []

if __name__ == "__main__":
    main()