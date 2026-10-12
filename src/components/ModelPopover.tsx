import React, { useState, useMemo } from 'react';
import { Cpu, ChevronDown, Check, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { useChatOptional } from '@/context/ChatContext';
import { useSettingsStore } from '@/store/useSettingsStore';
import { ProviderModels } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

export interface ModelPopoverProps {
  selectedModel?: string;
  onSelectModel?: (modelId: string) => void;
  availableModels?: ProviderModels[];
  className?: string;
}

interface NormalizedModel {
  id: string;
  name: string;
  providerName: string;
}

export const ModelPopover: React.FC<ModelPopoverProps> = ({
  selectedModel: propSelectedModel,
  onSelectModel,
  availableModels: propAvailableModels,
  className,
}) => {
  const chatContext = useChatOptional();
  const {
    chatFavoriteModels = [],
    chatRecentModels = [],
    setChatModel,
    addRecentChatModel,
    toggleFavoriteChatModel,
  } = useSettingsStore();

  const [open, setOpen] = useState(false);

  const selectedModel = propSelectedModel ?? chatContext?.selectedModel ?? '';
  const availableModels = propAvailableModels ?? chatContext?.availableModels ?? [];

  // Map of all known models from available providers for quick lookup
  const modelsMap = useMemo(() => {
    const map = new Map<string, NormalizedModel>();
    for (const provider of availableModels || []) {
      const pName =
        provider.provider_name ||
        (provider as any).provider ||
        provider.provider_type ||
        'Models';
      for (const m of provider.models || []) {
        if (m && m.id) {
          map.set(m.id, {
            id: m.id,
            name: m.name || m.id,
            providerName: pName,
          });
        }
      }
    }
    return map;
  }, [availableModels]);

  // Readable display name for trigger button
  const displayModelName = useMemo(() => {
    if (!selectedModel) return 'Select model';
    const found = modelsMap.get(selectedModel);
    return found ? found.name : selectedModel;
  }, [selectedModel, modelsMap]);

  // Favorites list
  const favoriteModels = useMemo(() => {
    const list: NormalizedModel[] = [];
    for (const id of chatFavoriteModels || []) {
      const existing = modelsMap.get(id);
      if (existing) {
        list.push(existing);
      } else {
        list.push({ id, name: id, providerName: 'Favorites' });
      }
    }
    return list;
  }, [chatFavoriteModels, modelsMap]);

  // Recent models list
  const recentModels = useMemo(() => {
    const list: NormalizedModel[] = [];
    for (const id of chatRecentModels || []) {
      const existing = modelsMap.get(id);
      if (existing) {
        list.push(existing);
      } else {
        list.push({ id, name: id, providerName: 'Recent' });
      }
    }
    return list;
  }, [chatRecentModels, modelsMap]);

  const handleSelect = (modelId: string) => {
    if (chatContext?.setSelectedModel) {
      chatContext.setSelectedModel(modelId);
    }
    if (setChatModel) {
      setChatModel(modelId);
    }
    if (addRecentChatModel) {
      addRecentChatModel(modelId);
    }
    if (onSelectModel) {
      onSelectModel(modelId);
    }
    setOpen(false);
  };

  const handleToggleFavorite = (modelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (toggleFavoriteChatModel) {
      toggleFavoriteChatModel(modelId);
    }
  };

  const renderModelItem = (model: NormalizedModel, key: string, groupKey: string) => {
    const isSelected = model.id === selectedModel;
    const isStarred = (chatFavoriteModels || []).includes(model.id);

    return (
      <CommandItem
        key={key}
        value={`${groupKey} ${model.id} ${model.name} ${model.providerName}`}
        onSelect={() => handleSelect(model.id)}
        className="flex items-center justify-between py-1.5 px-2 text-xs cursor-pointer group"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Check
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-opacity',
              isSelected ? 'opacity-100 text-primary' : 'opacity-0'
            )}
          />
          <span className="truncate font-medium">{model.name}</span>
        </div>
        <button
          type="button"
          aria-label={
            groupKey === 'fav'
              ? `Remove ${model.name} from favorites`
              : isStarred
              ? `Unstar ${model.name}`
              : `Star ${model.name}`
          }
          title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => handleToggleFavorite(model.id, e)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors shrink-0 ml-1.5"
        >
          <Star
            className={cn(
              'h-3.5 w-3.5',
              isStarred
                ? 'fill-amber-400 text-amber-500'
                : 'text-muted-foreground/60 hover:text-amber-500'
            )}
          />
        </button>
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Select AI model"
          className={cn(
            'h-8 px-2.5 text-xs flex items-center gap-1.5 max-w-[180px] sm:max-w-[220px] border-input bg-background font-normal shrink-0',
            className
          )}
        >
          <Cpu className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{displayModelName}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0 opacity-50 ml-0.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[280px] sm:w-[320px] p-0 shadow-lg border border-border"
        align="end"
      >
        <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
          <CommandInput placeholder="Search models..." className="h-9 text-xs" />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>No models found.</CommandEmpty>

            {/* Group 1: Favorites */}
            {favoriteModels.length > 0 && (
              <>
                <CommandGroup heading="Favorites">
                  {favoriteModels.map((m, idx) =>
                    renderModelItem(m, `fav-${m.id}-${idx}`, 'fav')
                  )}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Group 2: Recent */}
            {recentModels.length > 0 && (
              <>
                <CommandGroup heading="Recent">
                  {recentModels.map((m, idx) =>
                    renderModelItem(m, `recent-${m.id}-${idx}`, 'recent')
                  )}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {/* Group 3+: Categorized Provider Groups */}
            {availableModels.map((provider, pIdx) => {
              const pName =
                provider.provider_name ||
                (provider as any).provider ||
                provider.provider_type ||
                'Models';
              const pKey =
                provider.provider_type ||
                (provider as any).provider ||
                `provider-${pIdx}`;
              const models = provider.models || [];
              if (models.length === 0) return null;

              return (
                <CommandGroup key={pKey} heading={pName}>
                  {models.map((m, mIdx) => {
                    const itemModel = modelsMap.get(m.id) || {
                      id: m.id,
                      name: m.name || m.id,
                      providerName: pName,
                    };
                    return renderModelItem(
                      itemModel,
                      `prov-${pKey}-${m.id || mIdx}`,
                      pKey
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ModelPopover;
