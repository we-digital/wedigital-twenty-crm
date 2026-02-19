import styled from '@emotion/styled';
import type { EmailRecipients } from 'twenty-shared/workflow';

const sampleTwentyType: EmailRecipients = {
  to: 'widget@example.com',
  cc: 'copy@twenty.local',
};

if (typeof window !== 'undefined') {
  console.log(
    '[Twenty] Тип из текущего проекта (twenty-shared/workflow EmailRecipients):',
    sampleTwentyType,
    '→ typeof sampleTwentyType:',
    typeof sampleTwentyType,
  );
}

type WidgetDefinition = {
  id: string;
  name: string;
  description: string;
  url: string;
};

const widgets: WidgetDefinition[] = [
  {
    id: 'example-widget',
    name: 'Example Widget',
    description: 'Пример микрофронта для Twenty',
    url: 'https://example.com'
  },
  {
    id: 'pass-data-widget',
    name: 'Pass Data Widget',
    description: 'Пример 2 для Twenty',
    url: '/pass-data-widget/'
  }
];

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  justify-content: center;
  padding: 40px 16px;
  background-color: #050816;
  color: #f9fafb;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Inter',
    'Segoe UI', sans-serif;
`;

const Content = styled.div`
  width: 100%;
  max-width: 960px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: #9ca3af;
  margin-bottom: 24px;
`;

const List = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
`;

const Card = styled.a`
  display: block;
  padding: 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #020617, #111827);
  border: 1px solid rgba(148, 163, 184, 0.35);
  text-decoration: none;
  color: inherit;
  transition: transform 160ms ease-out, box-shadow 160ms ease-out,
    border-color 160ms ease-out, background 160ms ease-out;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.9);
    border-color: rgba(56, 189, 248, 0.7);
    background: linear-gradient(135deg, #020617, #0f172a);
  }
`;

const CardTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
`;

const CardDescription = styled.div`
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 10px;
`;

const CardUrl = styled.div`
  font-size: 12px;
  color: #38bdf8;
  word-break: break-all;
`;

export const App = () => (
  <Page>
    <Content>
      <Title>Widgets для Twenty</Title>
      <Subtitle>
        Список подключенных микрофронтендов. Здесь вы можете собрать внешние
        виджеты из других репозиториев.
      </Subtitle>
      <List>
        {widgets.map((widget) => (
          <Card key={widget.id} href={widget.url} target="_blank" rel="noreferrer">
            <CardTitle>{widget.name}</CardTitle>
            <CardDescription>{widget.description}</CardDescription>
            <CardUrl>{widget.url}</CardUrl>
          </Card>
        ))}
      </List>
    </Content>
  </Page>
);

