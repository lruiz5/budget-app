'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Budget, CategoryType } from '@/types/budget';
import { transformBudgetsToTrendData } from '@/lib/chartHelpers';
import { formatCurrency } from '@/lib/formatCurrency';
import { getCategoryColor, getCategoryEmoji } from '@/lib/chartColors';
import ChartTooltip from './ChartTooltip';
import ChartEmptyState from './ChartEmptyState';
import { FaChartLine } from 'react-icons/fa';

interface SpendingTrendsChartProps {
  budgets: Budget[];
}

export default function SpendingTrendsChart({ budgets }: SpendingTrendsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: null as React.ReactNode,
  });

  const categoryKeys: CategoryType[] = [
    'giving',
    'household',
    'transportation',
    'food',
    'personal',
    'insurance',
    'saving',
  ];

  const [visibleCategories, setVisibleCategories] = useState<Set<CategoryType>>(
    new Set(categoryKeys)
  );

  const trendData = useMemo(() => transformBudgetsToTrendData(budgets), [budgets]);

  const toggleCategory = (key: CategoryType) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || trendData.length < 2) return;

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    // Get container dimensions
    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();

    const margin = { top: 20, right: 30, bottom: 60, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(trendData, (d) => d.date) as [Date, Date])
      .range([0, chartWidth]);

    const allValues = trendData.flatMap((d) =>
      categoryKeys.map((key) => d.categories[key] || 0)
    );
    const maxValue = d3.max(allValues) || 0;

    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([chartHeight, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-chartWidth)
          .tickFormat(() => '')
      )
      .style('stroke', '#f3f4f6')
      .style('stroke-opacity', 0.7)
      .select('.domain')
      .remove();

    // X-axis
    const xAxis = g
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(trendData.length)
          .tickFormat((d) => {
            const date = d as Date;
            return `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
          })
      );

    xAxis.selectAll('text').style('font-size', '12px').style('fill', '#6b7280');

    xAxis.selectAll('line').style('stroke', '#e5e7eb');

    // Y-axis
    const yAxis = g.append('g').call(
      d3
        .axisLeft(yScale)
        .ticks(5)
        .tickFormat((d) => formatCurrency(d as number))
    );

    yAxis.selectAll('text').style('font-size', '12px').style('fill', '#6b7280');

    yAxis.selectAll('line').style('stroke', '#e5e7eb');

    // Line generator
    const line = d3
      .line<{ date: Date; value: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Draw lines for each category
    categoryKeys.forEach((key) => {
      if (!visibleCategories.has(key)) return;

      const lineData = trendData.map((d) => ({
        date: d.date,
        value: d.categories[key] || 0,
      }));

      const color = getCategoryColor(key);

      // Line path
      g.append('path')
        .datum(lineData)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2.5)
        .attr('d', line);

      // Dots
      g.selectAll(`.dot-${key}`)
        .data(lineData)
        .enter()
        .append('circle')
        .attr('class', `dot-${key}`)
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScale(d.value))
        .attr('r', 4)
        .attr('fill', color)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseenter', function (event, d) {
          d3.select(this).attr('r', 6);
          const monthData = trendData.find((td) => td.date.getTime() === d.date.getTime());
          if (monthData) {
            setTooltip({
              visible: true,
              x: event.pageX,
              y: event.pageY,
              content: (
                <div>
                  <div className="font-semibold text-text-primary mb-2">
                    {monthData.month} {monthData.year}
                  </div>
                  <div className="text-text-secondary">
                    {getCategoryEmoji(key)} {budgets[0]?.categories[key]?.name || key}:{' '}
                    {formatCurrency(d.value)}
                  </div>
                </div>
              ),
            });
          }
        })
        .on('mousemove', function (event) {
          setTooltip((prev) => ({ ...prev, x: event.pageX, y: event.pageY }));
        })
        .on('mouseleave', function () {
          d3.select(this).attr('r', 4);
          setTooltip((prev) => ({ ...prev, visible: false }));
        });
    });
  }, [trendData, visibleCategories, budgets, categoryKeys]);

  if (trendData.length < 2) {
    return (
      <ChartEmptyState
        icon={<FaChartLine />}
        title="Not enough data yet"
        message="Keep tracking your budget for a few months to see spending trends over time"
      />
    );
  }

  return (
    <>
      <div className="w-full h-full flex flex-col">
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4 px-2">
          {categoryKeys.map((key) => {
            const isVisible = visibleCategories.has(key);
            const color = getCategoryColor(key);
            const emoji = getCategoryEmoji(key);
            const name = budgets[0]?.categories[key]?.name || key;

            return (
              <button
                key={key}
                onClick={() => toggleCategory(key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${
                  isVisible
                    ? 'bg-surface-secondary border-2 border-border-strong'
                    : 'bg-surface-secondary border-2 border-border opacity-50'
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: isVisible ? color : '#d1d5db' }}
                />
                <span className={isVisible ? 'text-text-primary font-medium' : 'text-text-tertiary'}>
                  {emoji} {name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <div ref={containerRef} className="flex-1">
          <svg ref={svgRef} className="w-full h-full" />
        </div>
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
