'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink } from 'd3-sankey';
import { Budget } from '@/types/budget';
import { transformBudgetToFlowData, hasIncomeAndExpenses } from '@/lib/chartHelpers';
import { formatCurrency } from '@/lib/formatCurrency';
import ChartTooltip from './ChartTooltip';
import ChartEmptyState from './ChartEmptyState';
import { FaChartPie } from 'react-icons/fa';

interface FlowDiagramProps {
  budget: Budget | null;
}

interface ExtendedSankeyNode extends SankeyNode<{}, {}> {
  id?: string;
  label?: string;
  color?: string;
  column?: 'source' | 'category' | 'item';
  lineItems?: { name: string; amount: number }[];
}

interface ExtendedSankeyLink extends SankeyLink<ExtendedSankeyNode, {}> {
  color?: string;
  value: number;
}

export default function FlowDiagram({ budget }: FlowDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: null as React.ReactNode,
  });

  const flowData = useMemo(() => transformBudgetToFlowData(budget), [budget]);
  const hasData = hasIncomeAndExpenses(budget);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !hasData || flowData.nodes.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();

    const margin = { top: 30, right: 130, bottom: 20, left: 100 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Sankey layout
    const sankeyLayout = sankey<ExtendedSankeyNode, ExtendedSankeyLink>()
      .nodeId((d) => d.id as string)
      .nodeWidth(18)
      .nodePadding(12)
      .nodeSort(null) // preserve input order
      .extent([
        [0, 0],
        [chartWidth, chartHeight],
      ]);

    const graphInput = {
      nodes: flowData.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        color: node.color,
        column: node.column,
        lineItems: node.lineItems,
      })),
      links: flowData.links.map((link) => ({
        source: link.source,
        target: link.target,
        value: link.value,
        color: link.color,
      })),
    };

    const graph = sankeyLayout(graphInput as any) as {
      nodes: ExtendedSankeyNode[];
      links: ExtendedSankeyLink[];
    };

    // Gradients for links
    const defs = svg.append('defs');

    graph.links.forEach((link, i) => {
      const sourceNode = link.source as ExtendedSankeyNode;
      const targetNode = link.target as ExtendedSankeyNode;

      const gradient = defs
        .append('linearGradient')
        .attr('id', `flow-gradient-${i}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', sourceNode.x1 || 0)
        .attr('x2', targetNode.x0 || 0);

      gradient
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', sourceNode.color || '#059669')
        .attr('stop-opacity', 0.5);

      gradient
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', link.color || '#6b7280')
        .attr('stop-opacity', 0.5);
    });

    // Draw links
    g.selectAll('.link')
      .data(graph.links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', sankeyLinkHorizontal())
      .attr('stroke', (_d, i) => `url(#flow-gradient-${i})`)
      .attr('stroke-width', (d) => Math.max(1, d.width || 0))
      .attr('fill', 'none')
      .attr('opacity', 0.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 0.85);

        const sourceNode = d.source as ExtendedSankeyNode;
        const targetNode = d.target as ExtendedSankeyNode;

        setTooltip({
          visible: true,
          x: event.pageX,
          y: event.pageY,
          content: (
            <div>
              <div className="text-text-secondary text-sm mb-1">
                {sourceNode.label} &rarr; {targetNode.label}
              </div>
              <div className="text-text-primary font-semibold">{formatCurrency(d.value)}</div>
            </div>
          ),
        });
      })
      .on('mousemove', function (event) {
        setTooltip((prev) => ({ ...prev, x: event.pageX, y: event.pageY }));
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 0.5);
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    // Draw nodes
    const nodeGroups = g
      .selectAll('.node')
      .data(graph.nodes)
      .enter()
      .append('g')
      .attr('class', 'node');

    nodeGroups
      .append('rect')
      .attr('x', (d) => d.x0 || 0)
      .attr('y', (d) => d.y0 || 0)
      .attr('height', (d) => Math.max(1, (d.y1 || 0) - (d.y0 || 0)))
      .attr('width', (d) => (d.x1 || 0) - (d.x0 || 0))
      .attr('fill', (d) => d.color || '#6b7280')
      .attr('rx', 3)
      .attr('opacity', 0.9)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 1);

        // Highlight connected links
        g.selectAll('.link')
          .attr('opacity', function (linkData: any) {
            const src = linkData.source as ExtendedSankeyNode;
            const tgt = linkData.target as ExtendedSankeyNode;
            if (src.id === d.id || tgt.id === d.id) return 0.85;
            return 0.15;
          });

        const totalValue = d.value || 0;
        const items = d.lineItems;

        setTooltip({
          visible: true,
          x: event.pageX,
          y: event.pageY,
          content: (
            <div className="min-w-40">
              <div className="font-semibold text-text-primary mb-1">{d.label}</div>
              <div className="text-text-secondary text-sm mb-1">
                Total: {formatCurrency(totalValue)}
              </div>
              {items && items.length > 0 && (
                <div className="border-t border-border pt-1 mt-1 space-y-0.5">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between gap-4 text-sm">
                      <span className="text-text-secondary">{item.name}</span>
                      <span className="text-text-primary font-medium">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        });
      })
      .on('mousemove', function (event) {
        setTooltip((prev) => ({ ...prev, x: event.pageX, y: event.pageY }));
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 0.9);

        // Reset all links
        g.selectAll('.link').attr('opacity', 0.5);

        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    // Node labels — positioned based on column
    nodeGroups
      .append('text')
      .attr('x', (d) => {
        const col = d.column;
        if (col === 'source') return (d.x0 || 0) - 8; // Left of node
        if (col === 'item') return (d.x1 || 0) + 8; // Right of node
        // category (middle) — place above or to the side depending on space
        return ((d.x0 || 0) + (d.x1 || 0)) / 2;
      })
      .attr('y', (d) => {
        const col = d.column;
        if (col === 'category') return (d.y0 || 0) - 6; // Above the node
        return ((d.y1 || 0) + (d.y0 || 0)) / 2;
      })
      .attr('dy', (d) => (d.column === 'category' ? '0em' : '0.35em'))
      .attr('text-anchor', (d) => {
        const col = d.column;
        if (col === 'source') return 'end';
        if (col === 'item') return 'start';
        return 'middle';
      })
      .text((d) => d.label || '')
      .style('font-size', (d) => (d.column === 'category' ? '13px' : '11px'))
      .style('font-weight', (d) => (d.column === 'category' ? '600' : '500'))
      .style('fill', '#111827');

    // Amount labels on nodes
    nodeGroups
      .append('text')
      .attr('x', (d) => ((d.x0 || 0) + (d.x1 || 0)) / 2)
      .attr('y', (d) => ((d.y1 || 0) + (d.y0 || 0)) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .text((d) => {
        const nodeHeight = (d.y1 || 0) - (d.y0 || 0);
        // Only show amount on bars tall enough
        if (nodeHeight < 20) return '';
        return formatCurrency(d.value || 0);
      })
      .style('font-size', '9px')
      .style('font-weight', '600')
      .style('fill', '#ffffff');

    // Column headers
    const headerY = -12;

    svg
      .append('text')
      .attr('x', margin.left)
      .attr('y', margin.top + headerY)
      .attr('text-anchor', 'start')
      .text('Sources')
      .style('font-size', '12px')
      .style('font-weight', '700')
      .style('fill', '#059669')
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.05em');

    svg
      .append('text')
      .attr('x', margin.left + chartWidth / 2)
      .attr('y', margin.top + headerY)
      .attr('text-anchor', 'middle')
      .text('Categories')
      .style('font-size', '12px')
      .style('font-weight', '700')
      .style('fill', '#4b5563')
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.05em');

    svg
      .append('text')
      .attr('x', margin.left + chartWidth)
      .attr('y', margin.top + headerY)
      .attr('text-anchor', 'end')
      .text('Budget Items')
      .style('font-size', '12px')
      .style('font-weight', '700')
      .style('fill', '#6b7280')
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.05em');
  }, [flowData, hasData]);

  if (!hasData) {
    return (
      <ChartEmptyState
        icon={<FaChartPie />}
        title="No cash flow data"
        message="Record both income and expenses to visualize how your money flows through your budget"
      />
    );
  }

  return (
    <>
      <div ref={containerRef} className="w-full h-full">
        <svg ref={svgRef} className="w-full h-full" />
      </div>
      <ChartTooltip
        visible={tooltip.visible}
        x={tooltip.x}
        y={tooltip.y}
        content={tooltip.content}
      />
    </>
  );
}
