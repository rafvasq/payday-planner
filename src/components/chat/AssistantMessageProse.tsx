import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FigureChip } from './FigureChip';
import { GroundingBadge } from './GroundingBadge';
import { FigureSource } from '../../core/ai/toolkit';
import { Account, Event } from '../../core/models';
import {
  classifyMessageFigures,
  classifyFigure,
  harvestBaselineSources,
  isCurrencyToken,
  FigureClassification,
} from '../../core/ai/provenance';

function replaceFigureChips(
  node: React.ReactNode,
  figureMap: Map<string, FigureClassification>,
  allSources: FigureSource[],
  userMessages: string[]
): React.ReactNode {
  if (typeof node === 'string') {
    const regex = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\$\d+(?:\.\d{2})?/g;
    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(node)) !== null) {
      const rawToken = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + rawToken.length;

      if (!isCurrencyToken(rawToken)) {
        continue;
      }

      if (startIndex > lastIndex) {
        result.push(node.slice(lastIndex, startIndex));
      }

      const classification =
        figureMap.get(rawToken) ||
        classifyFigure(rawToken, allSources, userMessages);

      result.push(
        <FigureChip
          key={`fig-${startIndex}-${rawToken}`}
          classificationData={classification}
        />
      );

      lastIndex = endIndex;
    }

    if (lastIndex < node.length) {
      result.push(node.slice(lastIndex));
    }

    return result.length > 0 ? result : node;
  }

  if (Array.isArray(node)) {
    return React.Children.map(node, (child) =>
      replaceFigureChips(child, figureMap, allSources, userMessages)
    );
  }

  if (React.isValidElement(node)) {
    if (node.type === 'code' || node.type === 'pre' || node.type === FigureChip) {
      return node;
    }
    const props = node.props as any;
    if (props && props.children) {
      return React.cloneElement(node, {
        ...props,
        children: replaceFigureChips(props.children, figureMap, allSources, userMessages),
      });
    }
  }

  return node;
}

function createFigureComponents(
  figureMap: Map<string, FigureClassification>,
  allSources: FigureSource[],
  userMessages: string[]
) {
  const wrapTag = (tag: string) => {
    const Component = ({ children, ...props }: any) => {
      const Tag = tag as any;
      return <Tag {...props}>{replaceFigureChips(children, figureMap, allSources, userMessages)}</Tag>;
    };
    Component.displayName = `FigureWrapped(${tag})`;
    return Component;
  };

  return {
    p: wrapTag('p'),
    li: wrapTag('li'),
    td: wrapTag('td'),
    th: wrapTag('th'),
    strong: wrapTag('strong'),
    em: wrapTag('em'),
    h1: wrapTag('h1'),
    h2: wrapTag('h2'),
    h3: wrapTag('h3'),
    h4: wrapTag('h4'),
    h5: wrapTag('h5'),
    h6: wrapTag('h6'),
    blockquote: wrapTag('blockquote'),
    span: wrapTag('span'),
  };
}

export interface AssistantMessageProseProps {
  content: string;
  sources?: FigureSource[];
  userMessages: string[];
  accounts: Account[];
  events: Event[];
}

export const AssistantMessageProse: React.FC<AssistantMessageProseProps> = ({
  content,
  sources,
  userMessages,
  accounts,
  events,
}) => {
  const allSources = useMemo(() => {
    return [...harvestBaselineSources(accounts, events), ...(sources || [])];
  }, [accounts, events, sources]);

  const classificationResult = useMemo(() => {
    return classifyMessageFigures(content, allSources, userMessages);
  }, [content, allSources, userMessages]);

  const figureMap = useMemo(() => {
    const map = new Map<string, FigureClassification>();
    for (const f of classificationResult.figures) {
      map.set(f.rawText, f);
    }
    return map;
  }, [classificationResult]);

  const markdownComponents = useMemo(() => {
    return createFigureComponents(figureMap, allSources, userMessages);
  }, [figureMap, allSources, userMessages]);

  return (
    <>
      {classificationResult.totalFigures > 0 && (
        <span className="sr-only">{content}</span>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </>
  );
};

export interface AssistantMessageFooterProps {
  content: string;
  sources?: FigureSource[];
  userMessages: string[];
  accounts: Account[];
  events: Event[];
  isLastAssistant: boolean;
  isStreaming: boolean;
  onRegenerate: () => void;
}

export const AssistantMessageFooter: React.FC<AssistantMessageFooterProps> = ({
  content,
  sources,
  userMessages,
  accounts,
  events,
  isLastAssistant,
  isStreaming,
  onRegenerate,
}) => {
  const allSources = useMemo(() => {
    return [...harvestBaselineSources(accounts, events), ...(sources || [])];
  }, [accounts, events, sources]);

  const classificationResult = useMemo(() => {
    return classifyMessageFigures(content, allSources, userMessages);
  }, [content, allSources, userMessages]);

  const hasFigures = classificationResult.totalFigures > 0;
  const showRegen = isLastAssistant && !isStreaming;

  if (!hasFigures && !showRegen) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/40 mt-1">
      {hasFigures ? (
        <GroundingBadge
          totalFigures={classificationResult.totalFigures}
          unverifiedCount={classificationResult.unverifiedCount}
          figures={classificationResult.figures}
        />
      ) : (
        <div />
      )}
      {showRegen && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={isStreaming}
          className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground flex items-center gap-1.5 ml-auto"
          title="Regenerate response"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Regenerate</span>
        </Button>
      )}
    </div>
  );
};
