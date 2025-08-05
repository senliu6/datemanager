import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Row, Col, Table, Alert, Button, Select, Spin, Skeleton } from 'antd';
import ReactPlayer from 'react-player';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Points } from '@react-three/drei';
import * as THREE from 'three';
import Plot from 'react-plotly.js';
import { ErrorBoundary } from 'react-error-boundary';
import axios from 'axios';
import './LeRobotEpisodeCard.css';

const ErrorFallback = ({ error }) => (
    <Alert
        message="Point Cloud Rendering Error"
        description={`Failed to render point cloud: ${error.message}`}
        type="error"
        showIcon
    />
);

// 视频骨架图组件
const VideoSkeleton = () => (
    <div className="video-wrapper">
        <div className="video-container">
            <Skeleton.Image style={{ width: '100%', height: '200px' }} />
        </div>
        <Skeleton.Input style={{ width: '100%', marginTop: 8 }} size="small" />
    </div>
);

// 图表骨架图组件
const PlotSkeleton = () => (
    <div className="plot-container">
        <Skeleton.Input style={{ width: '200px', marginBottom: 16 }} />
        <Skeleton active paragraph={{ rows: 8 }} />
    </div>
);

// 表格骨架图组件
const TableSkeleton = () => (
    <div className="frame-data">
        <Skeleton.Input style={{ width: '250px', marginBottom: 16 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
    </div>
);

// 点云骨架图组件
const PointCloudSkeleton = ({ title }) => (
    <div className="pointcloud-view">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Skeleton.Input style={{ width: '150px' }} size="small" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Skeleton.Button style={{ width: 80 }} size="small" />
                <Skeleton.Button style={{ width: 80 }} size="small" />
            </div>
        </div>
        <Skeleton.Image style={{ width: '100%', height: '400px' }} />
    </div>
);

// 控制面板骨架图组件
const ControlPanelSkeleton = () => (
    <div className="control-panel">
        <Skeleton.Button style={{ width: 40 }} />
        <Skeleton.Input style={{ width: '60%', margin: '0 16px' }} />
        <Skeleton.Input style={{ width: 100 }} size="small" />
    </div>
);

const PointCloud = ({ points, camera }) => {
    const meshRef = useRef();
    const colorArray = useMemo(() => {
        const colors = [];
        if (!points?.length) return new Float32Array();

        const zValues = points.map(p => p[2]);
        const minZ = Math.min(...zValues);
        const maxZ = Math.max(...zValues);
        const rangeZ = Math.max(maxZ - minZ, 1e-5);

        for (let i = 0; i < points.length; i++) {
            const normZ = (points[i][2] - minZ) / rangeZ;
            const color = new THREE.Color();
            color.setHSL(0.7 - normZ * 0.7, 1.0, 0.5);
            colors.push(color.r, color.g, color.b);
        }
        return new Float32Array(colors);
    }, [points]);

    const matrixArray = useMemo(() => {
        const matrices = [];
        const dummy = new THREE.Object3D();
        for (let i = 0; i < points.length; i++) {
            const [x, y, z] = points[i];
            dummy.position.set(x, y, z);
            dummy.scale.set(0.015, 0.015, 0.015);
            dummy.updateMatrix();
            matrices.push(dummy.matrix.clone());
        }
        return matrices;
    }, [points]);

    useEffect(() => {
        if (meshRef.current && matrixArray.length) {
            for (let i = 0; i < matrixArray.length; i++) {
                meshRef.current.setMatrixAt(i, matrixArray[i]);
            }
            meshRef.current.instanceMatrix.needsUpdate = true;

            if (colorArray.length) {
                meshRef.current.geometry.setAttribute(
                    'color',
                    new THREE.InstancedBufferAttribute(colorArray, 3)
                );
            }
        }
    }, [matrixArray, colorArray]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[null, null, points.length]}
            castShadow
            receiveShadow
        >
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshStandardMaterial vertexColors />
        </instancedMesh>
    );
};

const CameraAdjuster = ({ points, camera, onResetCamera }) => {
    const { camera: threeCamera } = useThree();
    const [isCameraInitialized, setIsCameraInitialized] = useState(false);

    useEffect(() => {
        if (points?.length > 0 && !isCameraInitialized) {
            const flatPoints = points.flatMap(p => (Array.isArray(p) && p.length === 3 ? p.map(Number) : []));
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 2; i < flatPoints.length; i += 3) {
                const z = flatPoints[i];
                if (isFinite(z)) {
                    minZ = Math.min(minZ, z);
                    maxZ = Math.max(maxZ, z);
                }
            }
            if (isFinite(minZ) && isFinite(maxZ)) {
                const centerZ = (minZ + maxZ) / 2;
                const distance = Math.max(2.0, maxZ - minZ + 1.0);
                threeCamera.position.set(0, 0, distance);
                threeCamera.lookAt(0, 0, centerZ);
                setIsCameraInitialized(true);
            }
        }
    }, [points, threeCamera, camera, isCameraInitialized]);

    useEffect(() => {
        if (onResetCamera) {
            setIsCameraInitialized(false);
        }
    }, [onResetCamera]);

    return null;
};

const CanvasContextHandler = ({ setWebGLContextLost }) => {
    const { gl } = useThree();
    useEffect(() => {
        const canvas = gl.domElement;
        const handleContextLost = (event) => {
            event.preventDefault();
            setWebGLContextLost(true);
        };
        const handleContextRestored = () => {
            setWebGLContextLost(false);
        };
        canvas.addEventListener('webglcontextlost', handleContextLost);
        canvas.addEventListener('webglcontextrestored', handleContextRestored);
        return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            canvas.removeEventListener('webglcontextrestored', handleContextRestored);
        };
    }, [gl, setWebGLContextLost]);
    return null;
};

const LeRobotEpisodeCard = ({ episode }) => {
    const { index, folderPath, key, video_paths, motor_data, frame_count, original_frame_count, pointcloud_data } = episode || {};
    const [currentTime, setCurrentTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [webGLContextLost, setWebGLContextLost] = useState(false);
    const [videoDuration, setVideoDuration] = useState(0);
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [resetCameraTrigger, setResetCameraTrigger] = useState(0);
    const [pointcloudQuality, setPointcloudQuality] = useState('medium');
    const [pointcloudLoading, setPointcloudLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);

    const playerRefs = useRef({});

    // 当episode切换时，重置状态并显示骨架图
    useEffect(() => {
        if (episode?.key) {
            console.log('🎭 Episode changed, showing skeleton:', episode.key);
            setPointcloudQuality('medium');
            setPointcloudLoading(false);
            setDataLoading(true);

            // 确保骨架图至少显示3秒，让用户能看到加载效果
            const minDisplayTimer = setTimeout(() => {
                console.log('⏰ Minimum skeleton display time reached, hiding skeleton');
                setDataLoading(false);
            }, 3000);

            return () => {
                console.log('🧹 Cleaning up skeleton timer for:', episode.key);
                clearTimeout(minDisplayTimer);
            };
        }
    }, [episode?.key]);

    const handleDuration = useCallback((duration) => {
        if (duration && isFinite(duration)) {
            setVideoDuration(duration);
            setIsVideoLoaded(true);
        } else {
            setVideoDuration(1);
            setIsVideoLoaded(true);
        }
    }, []);

    useEffect(() => {
        Object.values(playerRefs.current).forEach((ref) => {
            if (ref) {
                if (playing) ref.getInternalPlayer()?.play?.();
                else ref.getInternalPlayer()?.pause?.();
            }
        });
    }, [playing]);

    const currentFrameData = useMemo(() => {
        if (!motor_data?.motors?.length || videoDuration <= 0) {
            return { time: 0, action: [] };
        }
        const idx = Math.min(Math.floor((currentTime / videoDuration) * motor_data.motors.length), motor_data.motors.length - 1);
        return { time: motor_data.time[idx] || 0, action: motor_data.motors[idx] || [] };
    }, [motor_data, currentTime, videoDuration]);

    const currentDataSource = useMemo(() => {
        return Array.from({ length: 6 }, (_, idx) => ({
            key: `motor_${idx}`,
            motor: `Motor ${idx}`,
            state: currentFrameData.action[idx]?.toFixed(2) || 'N/A',
            action: currentFrameData.action[idx]?.toFixed(2) || 'N/A',
        }));
    }, [currentFrameData]);

    const currentColumns = useMemo(
        () => [
            { title: 'Motor', dataIndex: 'motor', key: 'motor' },
            { title: 'State', dataIndex: 'state', key: 'state' },
            { title: 'Action', dataIndex: 'action', key: 'action' },
        ],
        []
    );

    const computedPointcloudData = useMemo(() => {
        if (!isVideoLoaded || !pointcloud_data || !pointcloud_data.cam_top || !pointcloud_data.cam_right_wrist) {
            return { cam_top: [], cam_right_wrist: [] };
        }
        const frameCount = pointcloud_data.cam_top.length;
        const idx = Math.min(
            Math.round((currentTime / videoDuration) * (frameCount - 1)),
            frameCount - 1
        );
        const camTopPoints = Array.isArray(pointcloud_data.cam_top[idx])
            ? pointcloud_data.cam_top[idx].filter(p => Array.isArray(p) && p.length === 3 && p.every(v => isFinite(v)))
            : [];
        const camRightWristPoints = Array.isArray(pointcloud_data.cam_right_wrist[idx])
            ? pointcloud_data.cam_right_wrist[idx].filter(p => Array.isArray(p) && p.length === 3 && p.every(v => isFinite(v)))
            : [];
        return {
            cam_top: camTopPoints,
            cam_right_wrist: camRightWristPoints,
        };
    }, [isVideoLoaded, pointcloud_data, currentTime, videoDuration]);

    const plotData = useMemo(() => {
        if (!motor_data?.motors?.length || videoDuration <= 0) {
            return [];
        }
        const numMotors = Math.min(motor_data.motors[0]?.length || 0, 6);
        const xValues = Array.from({ length: frame_count }, (_, i) => (i / (frame_count - 1)) * videoDuration);
        return Array.from({ length: numMotors }, (_, idx) => ({
            x: xValues,
            y: motor_data.motors.map(row => Number(row[idx]) || 0),
            type: 'scatter',
            mode: 'lines',
            name: `Motor ${idx}`,
            line: { color: `hsl(${idx * 60}, 70%, 50%)` },
        }));
    }, [motor_data, videoDuration, frame_count]);

    const plotLayout = useMemo(() => {
        const yMin = Math.min(...motor_data?.motors.flatMap(row => row.map(Number)) || [-2.5]);
        const yMax = Math.max(...motor_data?.motors.flatMap(row => row.map(Number)) || [2.5]);
        return {
            width: '100%',
            height: 400,
            title: 'Motor Data',
            xaxis: { title: 'Time (s)' },
            yaxis: { title: 'Motor Value', range: [yMin - 0.5, yMax + 0.5] },
            shapes: [
                {
                    type: 'line',
                    x0: currentTime,
                    x1: currentTime,
                    y0: yMin - 0.5,
                    y1: yMax + 0.5,
                    yref: 'y',
                    line: {
                        color: 'red',
                        width: 2,
                        dash: 'dash',
                    },
                },
            ],
        };
    }, [currentTime, motor_data, videoDuration]);

    const handleProgress = useCallback((state) => {
        setCurrentTime(state.playedSeconds);
    }, []);

    const handlePlayPause = useCallback(() => {
        setPlaying((prev) => !prev);
    }, []);

    const handleSeek = useCallback(
        (e) => {
            const newTime = parseFloat(e.target.value);
            setCurrentTime(newTime);
            Object.values(playerRefs.current).forEach((ref) => {
                if (ref) ref.seekTo(newTime / videoDuration);
            });
        },
        [videoDuration]
    );

    const handleResetCamera = useCallback(() => {
        setResetCameraTrigger(prev => prev + 1);
    }, []);

    const handleMouseEnter = () => setHovered(true);
    const handleMouseLeave = () => setHovered(false);

    // 更新点云数据
    const updatePointcloudData = useCallback(async (quality) => {
        if (!folderPath || !key) return;

        setPointcloudLoading(true);
        try {
            const response = await axios.get(`/api/lerobot/pointcloud/${encodeURIComponent(folderPath)}/${key}`, {
                params: { quality },
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });

            if (response.data.success) {
                // 更新episode的点云数据
                episode.pointcloud_data = response.data.data.pointcloud_data;
                console.log(`Updated pointcloud for ${key} with quality ${quality}`);
            }
        } catch (error) {
            console.error('Error updating pointcloud data:', error);
        } finally {
            setPointcloudLoading(false);
        }
    }, [folderPath, key, episode]);

    // 处理质量切换
    const handleQualityChange = useCallback((quality) => {
        setPointcloudQuality(quality);
        updatePointcloudData(quality);
    }, [updatePointcloudData]);


    // 如果没有episode数据，显示骨架图
    if (!episode) {
        console.log('📭 No episode data, showing skeleton');
        return (
            <div className="episode-card" style={{ position: 'relative' }}>
                <Skeleton.Input style={{ width: '300px', marginBottom: 16 }} />
                <div className="playback-area">
                    <Row gutter={[16, 16]}>
                        <Col span={8}><VideoSkeleton /></Col>
                        <Col span={8}><VideoSkeleton /></Col>
                        <Col span={8}><VideoSkeleton /></Col>
                    </Row>
                    <ControlPanelSkeleton />
                    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                        <Col span={16}><PlotSkeleton /></Col>
                        <Col span={8}><TableSkeleton /></Col>
                    </Row>
                    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                        <Col span={12}><PointCloudSkeleton title="点云 (cam_top)" /></Col>
                        <Col span={12}><PointCloudSkeleton title="点云 (cam_right_wrist)" /></Col>
                    </Row>
                </div>
            </div>
        );
    }

    return (
        <div className="episode-card" style={{ position: 'relative' }}>

            {webGLContextLost && (
                <Alert
                    message="WebGL Context Lost"
                    description="The WebGL context was lost. Please refresh the page or try a different browser."
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}
            <div className="playback-area">
                {dataLoading ? (
                    <>
                        <Row gutter={[16, 16]}>
                            <Col span={8}><VideoSkeleton /></Col>
                            <Col span={8}><VideoSkeleton /></Col>
                            <Col span={8}><VideoSkeleton /></Col>
                        </Row>
                        <ControlPanelSkeleton />
                    </>
                ) : (
                    <>
                        <Row gutter={[16, 16]}>
                            {Object.entries(video_paths || {})
                                .filter(([_, videoPath]) => typeof videoPath === 'string' && videoPath)
                                .map(([camera, videoPath]) => (
                                    <Col span={8} key={camera}>
                                        <div
                                            className="video-wrapper"
                                            onMouseEnter={handleMouseEnter}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <div className="video-container">
                                                <ReactPlayer
                                                    ref={(ref) => (playerRefs.current[camera] = ref)}
                                                    url={videoPath}
                                                    width="100%"
                                                    height="100%"
                                                    playing={playing}
                                                    onProgress={handleProgress}
                                                    onDuration={handleDuration}
                                                    progressInterval={100}
                                                    onError={() => {
                                                        setVideoDuration(1);
                                                        setIsVideoLoaded(true);
                                                    }}
                                                    className="video-player"
                                                    style={{ background: 'transparent' }}
                                                />
                                                {hovered && (
                                                    <button className="play-overlay-btn" onClick={handlePlayPause}>
                                                        {playing ? '⏸' : '▶'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="video-label">{`${camera}: ${videoPath.split('/').pop()}`}</div>
                                        </div>
                                    </Col>
                                ))}
                        </Row>
                        <div className="control-panel">
                            <button className="play-pause-btn" onClick={handlePlayPause}>
                                {playing ? '⏸' : '▶'}
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={videoDuration || 1}
                                step={0.01}
                                value={currentTime}
                                onChange={handleSeek}
                                className="seek-bar"
                            />
                            <span className="time-display">
                                {currentTime.toFixed(2)} / {videoDuration.toFixed(2)}s
                            </span>
                        </div>
                    </>
                )}

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={16}>
                        {dataLoading ? (
                            <PlotSkeleton />
                        ) : (
                            <div className="plot-container">
                                <Plot data={plotData} layout={plotLayout} />
                            </div>
                        )}
                    </Col>
                    <Col span={8}>
                        {dataLoading ? (
                            <TableSkeleton />
                        ) : (
                            <div className="frame-data">
                                <strong>Current Frame Data (Time: {currentTime.toFixed(2)}s)</strong>
                                <Table
                                    columns={currentColumns}
                                    dataSource={currentDataSource}
                                    pagination={false}
                                    size="small"
                                    className="frame-table"
                                />
                            </div>
                        )}
                    </Col>
                </Row>

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={12}>
                        {dataLoading ? (
                            <PointCloudSkeleton title="点云 (cam_top)" />
                        ) : (
                            <div className="pointcloud-view">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <h4 style={{ margin: 0 }}>点云 (cam_top)</h4>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {pointcloudLoading && <Spin size="small" />}
                                        <Select
                                            value={pointcloudQuality}
                                            onChange={handleQualityChange}
                                            size="small"
                                            style={{ width: 120 }}
                                            disabled={pointcloudLoading}
                                        >
                                            <Select.Option value="low">低质量</Select.Option>
                                            <Select.Option value="medium">中等质量</Select.Option>
                                            <Select.Option value="high">高质量</Select.Option>
                                            <Select.Option value="full">完整数据</Select.Option>
                                        </Select>
                                        <Button onClick={handleResetCamera} size="small">
                                            重置相机
                                        </Button>
                                    </div>
                                </div>
                                {!isVideoLoaded || computedPointcloudData.cam_top.length === 0 || webGLContextLost || pointcloudLoading ? (
                                    <Alert
                                        message={pointcloudLoading ? "加载中..." : "无点云数据"}
                                        description={pointcloudLoading ? "正在加载点云数据，请稍候..." : "cam_top 没有有效的点云数据或 WebGL 上下文丢失。"}
                                        type={pointcloudLoading ? "info" : "warning"}
                                        showIcon
                                    />
                                ) : (
                                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                                        <div style={{ width: '100%', height: '400px' }}>
                                            <Canvas
                                                camera={{ position: [0, 0, 3.0], fov: 100 }}
                                                style={{ width: '100%', height: '400px', background: '#000000' }}
                                                frameloop="always"
                                            >
                                                <CanvasContextHandler setWebGLContextLost={setWebGLContextLost} />
                                                <CameraAdjuster
                                                    points={computedPointcloudData.cam_top}
                                                    camera="cam_top"
                                                    onResetCamera={resetCameraTrigger}
                                                />
                                                <ambientLight intensity={2.5} />
                                                <pointLight position={[2, 2, 2]} intensity={5} />
                                                <pointLight position={[-2, -2, -2]} intensity={5} />
                                                <primitive object={new THREE.AxesHelper(1)} />
                                                <gridHelper args={[2, 20, 0x444444, 0x888888]} />
                                                <PointCloud points={computedPointcloudData.cam_top} camera="cam_top" />
                                                <OrbitControls
                                                    enablePan={true}
                                                    enableZoom={true}
                                                    enableRotate={true}
                                                    minDistance={0.1}
                                                    maxDistance={5}
                                                />
                                            </Canvas>
                                        </div>
                                    </ErrorBoundary>
                                )}
                            </div>
                        )}
                    </Col>
                    <Col span={12}>
                        {dataLoading ? (
                            <PointCloudSkeleton title="点云 (cam_right_wrist)" />
                        ) : (
                            <div className="pointcloud-view">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <h4 style={{ margin: 0 }}>点云 (cam_right_wrist)</h4>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {pointcloudLoading && <Spin size="small" />}
                                        <Select
                                            value={pointcloudQuality}
                                            onChange={handleQualityChange}
                                            size="small"
                                            style={{ width: 120 }}
                                            disabled={pointcloudLoading}
                                        >
                                            <Select.Option value="low">低质量</Select.Option>
                                            <Select.Option value="medium">中等质量</Select.Option>
                                            <Select.Option value="high">高质量</Select.Option>
                                            <Select.Option value="full">完整数据</Select.Option>
                                        </Select>
                                        <Button onClick={handleResetCamera} size="small">
                                            重置相机
                                        </Button>
                                    </div>
                                </div>
                                {!isVideoLoaded || computedPointcloudData.cam_right_wrist.length === 0 || webGLContextLost || pointcloudLoading ? (
                                    <Alert
                                        message={pointcloudLoading ? "加载中..." : "无点云数据"}
                                        description={pointcloudLoading ? "正在加载点云数据，请稍候..." : "cam_right_wrist 没有有效的点云数据或 WebGL 上下文丢失。"}
                                        type={pointcloudLoading ? "info" : "warning"}
                                        showIcon
                                    />
                                ) : (
                                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                                        <div style={{ width: '100%', height: '400px' }}>
                                            <Canvas
                                                camera={{ position: [0, 0, 3.0], fov: 100 }}
                                                style={{ width: '100%', height: '400px', background: '#000000' }}
                                                frameloop="always"
                                            >
                                                <CanvasContextHandler setWebGLContextLost={setWebGLContextLost} />
                                                <CameraAdjuster
                                                    points={computedPointcloudData.cam_right_wrist}
                                                    camera="cam_right_wrist"
                                                    onResetCamera={resetCameraTrigger}
                                                />
                                                <ambientLight intensity={2.5} />
                                                <pointLight position={[2, 2, 2]} intensity={5} />
                                                <pointLight position={[-2, -2, -2]} intensity={5} />
                                                <primitive object={new THREE.AxesHelper(1)} />
                                                <gridHelper args={[2, 20, 0x444444, 0x888888]} />
                                                <PointCloud points={computedPointcloudData.cam_right_wrist} camera="cam_right_wrist" />
                                                <OrbitControls
                                                    enablePan={true}
                                                    enableZoom={true}
                                                    enableRotate={true}
                                                    minDistance={0.1}
                                                    maxDistance={5}
                                                />
                                            </Canvas>
                                        </div>
                                    </ErrorBoundary>
                                )}
                            </div>
                        )}
                    </Col>
                </Row>
            </div>
        </div>
    );
};

export default React.memo(LeRobotEpisodeCard);
