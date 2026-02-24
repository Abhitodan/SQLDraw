import { Table, Typography } from "antd";

const { Text } = Typography;

interface Props {
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

export default function ResultPreview({ columns, rows }: Props) {
  const tableColumns = columns.map((col, i) => ({
    title: col,
    dataIndex: i.toString(),
    key: col,
    ellipsis: true,
    render: (val: unknown) =>
      val === null || val === undefined ? (
        <Text type="secondary" italic style={{ fontSize: 11 }}>
          NULL
        </Text>
      ) : (
        <span style={{ fontSize: 11 }}>{String(val)}</span>
      ),
  }));

  const dataSource = rows.map((row, ri) => {
    const record: Record<string, unknown> = { key: ri };
    row.forEach((cell, ci) => {
      record[ci.toString()] = cell;
    });
    return record;
  });

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 10 }}>
        RESULT PREVIEW ({rows.length} row{rows.length !== 1 ? "s" : ""})
      </Text>
      <Table
        columns={tableColumns}
        dataSource={dataSource}
        size="small"
        pagination={false}
        scroll={{ x: true, y: 150 }}
        style={{ marginTop: 4 }}
      />
    </div>
  );
}
