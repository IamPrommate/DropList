// src/app/components/AlbumList.tsx
'use client';

import { List, Typography } from 'antd';

type Props = {
  albums: string[];
  onSelect: (name: string) => void;
};

export default function AlbumList({ albums, onSelect }: Props) {
  return (
    <List
      size="small"
      bordered
      dataSource={albums}
      renderItem={(name) => (
        <List.Item onClick={() => onSelect(name)} style={{ cursor: 'pointer' }}>
          <Typography.Text ellipsis title={name} style={{ maxWidth: '100%' }}>
            {name}
          </Typography.Text>
        </List.Item>
      )}
    />
  );
}


