
import { test, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModelPopover } from '../ModelPopover';
import { ChatProvider } from '../../context/ChatContext';
import { useSettingsStore } from '../../store/useSettingsStore';

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({
    chatFavoriteModels: [],
    chatRecentModels: [],
    setChatModel: vi.fn(),
  })
}));

test('ModelPopover search upper case', async () => {
  const models = [{
    provider_type: 'openai',
    provider_name: 'OpenAI',
    models: [{ id: 'gpt-4', name: 'GPT-4' }]
  }];

  render(<ModelPopover availableModels={models} />);
  const trigger = screen.getByRole('combobox');
  await act(async () => {
    fireEvent.click(trigger);
  });
  
  const input = screen.getByPlaceholderText('Search models...');
  
  // Search uppercase
  await act(async () => {
    fireEvent.change(input, { target: { value: 'GPT' } });
  });

  const empty = document.querySelector('[cmdk-empty]');
  console.log('Search GPT - Empty text:', empty?.textContent);
  
  await act(async () => {
    fireEvent.change(input, { target: { value: 'OpenAI' } });
  });
  console.log('Search OpenAI - Empty text:', document.querySelector('[cmdk-empty]')?.textContent);
});
