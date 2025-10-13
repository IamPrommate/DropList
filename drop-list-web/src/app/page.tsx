// src/app/page.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import AudioPlayer from './components/AudioPlayer';
import { PlaylistType, TrackType } from './lib/types';
import { Layout, Button, Space, Switch, Typography, List } from 'antd';
import AlbumList from './components/AlbumList';
import './layout.scss';
const { Sider, Content } = Layout;
const { Title, Text } = Typography;

function makeId() {
  return Math.random().toString(36).slice(2);
}

export default function HomePage() {
  const [tracks, setTracks] = useState<TrackType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [albums, setAlbums] = useState<string[]>([]);

  const currentTrack = tracks[currentIndex];

  const playlist: PlaylistType = useMemo(
    () => ({
      id: 'local',
      name: 'Local Session',
      tracks,
      currentIndex,
      isShuffled,
      volume,
    }),
    [tracks, currentIndex, isShuffled, volume]
  );

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const next: TrackType[] = Array.from(files)
      .filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name))
      .map((f) => ({
        id: makeId(),
        name: f.name,
        file: f,
      }));
    setTracks(next);
    setCurrentIndex(0);
    setIsPlaying(next.length > 0);

    // Derive folder name when picking a directory (webkitRelativePath available)
    const first: any = files[0];
    const rel: string | undefined = first && (first.webkitRelativePath as string | undefined);
    if (rel && rel.includes('/')) {
      const top = rel.split('/')[0];
      setSelectedFolderName(top || null);
      if (top) {
        setAlbums((prev) => (prev.includes(top) ? prev : [...prev, top]));
      }
    } else {
      setSelectedFolderName(null);
    }
  }, []);

  // Directory picker (supported in Chromium-based browsers)
  const handleFolderPick = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.flac';
    input.onchange = () => handleFilesSelected(input.files);
    input.click();
  }, [handleFilesSelected]);

  const handleNext = useCallback(() => {
    if (tracks.length === 0) return;
    if (isShuffled) {
      const next = Math.floor(Math.random() * tracks.length);
      setCurrentIndex(next);
    } else {
      setCurrentIndex((i) => (i + 1) % tracks.length);
    }
    setIsPlaying(true);
  }, [tracks, isShuffled]);

  const handlePrev = useCallback(() => {
    if (tracks.length === 0) return;
    if (isShuffled) {
      const next = Math.floor(Math.random() * tracks.length);
      setCurrentIndex(next);
    } else {
      setCurrentIndex((i) => (i - 1 + tracks.length) % tracks.length);
    }
    setIsPlaying(true);
  }, [tracks, isShuffled]);

  const handleShuffleToggle = useCallback(() => {
    setIsShuffled((s) => !s);
  }, []);

  return (
    <main className="pageRoot">
      <div suppressHydrationWarning>
        <Layout style={{ minHeight: '100dvh' }}>
          <Sider width={300} className='sidebar'>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Button block onClick={handleFolderPick}>Pick folder</Button>
              <AlbumList albums={albums} onSelect={() => {}} />
            </Space>
          </Sider>
          <Content className='pt-12'>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {selectedFolderName ? (
                <div style={{ maxWidth: 900, margin: '0 auto' }}>
                  <Title level={1} style={{ margin: 0 }}>{selectedFolderName}</Title>
                </div>
              ) : null}
              <List
                size="large"
                bordered
                dataSource={tracks}
                style={{ maxWidth: 900, margin: '0 auto' }}
                className='mt-20'
                renderItem={(t, i) => (
                  <List.Item
                    onClick={() => {
                      setCurrentIndex(i);
                      setIsPlaying(true);
                    }}
                    style={{
                      cursor: 'pointer',
                      background: i === currentIndex ? 'var(--ant-primary-color-deprecated-5, #e6f4ff)' : undefined,
                    }}
                  >
                    <Text ellipsis title={t.name} style={{ maxWidth: '100%' }}>
                      {t.name}
                    </Text>
                  </List.Item>
                )}
              />
            </Space>
          </Content>
        </Layout>

        {/* Fixed bottom audio bar via SCSS */}
        <AudioPlayer
          track={currentTrack}
          volume={volume}
          onEnded={handleNext}
          onVolumeChange={setVolume}
          onPlayPauseToggle={() => setIsPlaying((p) => !p)}
          isPlaying={isPlaying}
          handlePrev={handlePrev}
          handleNext={handleNext}
          handleShuffleToggle={handleShuffleToggle}
          isShuffled={isShuffled}
        />

      </div>
    </main>
  );
}