// src/components/Playlist.tsx
'use client';

import { TrackType } from '../lib/types';
import { List, Typography } from 'antd';
const { Text } = Typography;

type Props = {
  tracks: TrackType[];
  currentIndex: number;
  onSelect: (index: number) => void;
};

export default function Playlist({ tracks, currentIndex, onSelect }: Props) {
  return (
    <List
      size="small"
      bordered
      dataSource={tracks}
      className="playlist"
      renderItem={(t, i) => (
        <List.Item
          onClick={() => onSelect(i)}
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
  );
}