'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Budget } from '@/types/budget';
import { transformBudgetToCategoryData, hasTransactionData } from '@/lib/chartHelpers';
import { formatCurrency } from '@/lib/formatCurrency';
import ChartTooltip from './ChartTooltip';
import ChartEmptyState from './ChartEmptyState';
import { FaChartBar } from 'react-icons/fa';

interface BudgetVsActualChartProps {
  budget: Budget | null;
}

export default function BudgetVsActualChart({ budget }: BudgetVsActualChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    content: null as React.ReactNode,
  });

  const chartData = useMemo(() => transformBudgetToCategoryData(budget), [budget]);
  const hasData = hasTransactionData(budget);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !hasData || chartData.length === 0) return;

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    // Get container dimensions
    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();

    const margin = { top: 20, right: 100, bottom: 40, left: 120 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const yScale = d3
      .scaleBand()
      .domain(chartData.map((d) => d.name))
      .range([0, chartHeight])
      .padding(0.3);

    const maxValue = d3.max(chartData, (d) => Math.max(d.planned, d.actual)) || 0;
    const xScale = d3
      .scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([0, chartWidth]);

    // Y-axis (categories)
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .selectAll('text')
      .style('font-size', '14px')
      .style('font-weight', '500')
      .style('fill', '#111827');

    // Remove Y-axis line
    g.select('.domain').remove();

    // X-axis (amounts)
    const xAxis = g
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickFormat((d) => formatCurrency(d as number))
      );

    xAxis.selectAll('text').style('font-size', '12px').style('fill', '#6b7280');

    xAxis.selectAll('line').style('stroke', '#e5e7eb');

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickSize(chartHeight)
          .tickFormat(() => '')
      )
      .style('stroke', '#f3f4f6')
      .style('stroke-opacity', 0.7)
      .select('.domain')
      .remove();

    // Bar groups
    const barGroups = g
      .selectAll('.bar-group')
      .data(chartData)
      .enter()
      .append('g')
      .attr('class', 'bar-group')
      .attr('transform', (d) => `translate(0,${yScale(d.name)})`);

    const barHeight = yScale.bandwidth() / 2.5;

    // Planned bars (gray)
    barGroups
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', (d) => xScale(d.planned))
      .attr('height', barHeight)
      .attr('fill', '#d1d5db')
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('fill', '#9ca3af');
        setTooltip({
          visible: true,
          x: event.pageX,
          y: event.pageY,
          content: (
            <div>
              <div className="font-semibold text-text-primary mb-1">
                {d.emoji} {d.name} - Planned
              </div>
              <div className="text-text-secondary">{formatCurrency(d.planned)}</div>
            </div>
          ),
        });
      })
      .on('mousemove', function (event) {
        setTooltip((prev) => ({ ...prev, x: event.pageX, y: event.pageY }));
      })
      .on('mouseleave', function () {
        d3.select(this).attr('fill', '#d1d5db');
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    // Actual bars (category color)
    barGroups
      .append('rect')
      .attr('x', 0)
      .attr('y', barHeight + 4)
      .attr('width', (d) => xScale(d.actual))
      .attr('height', barHeight)
      .attr('fill', (d) => (d.actual > d.planned ? '#dc2626' : d.color))
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .style('filter', (d) =>
        d.actual > d.planned ? 'drop-shadow(0 0 4px rgba(220, 38, 38, 0.4))' : 'none'
      )
      .on('mouseenter', function (event, d) {
        const currentColor = d.actual > d.planned ? '#dc2626' : d.color;
        const hoverColor = d.actual > d.planned ? '#b91c1c' : d3.rgb(currentColor).darker(0.3).toString();
        d3.select(this).attr('fill', hoverColor);

        const difference = d.actual - d.planned;
        const diffText =
          difference > 0
            ? `${formatCurrency(difference)} over`
            : difference < 0
            ? `${formatCurrency(Math.abs(difference))} under`
            : 'On budget';

        setTooltip({
          visible: true,
          x: event.pageX,
          y: event.pageY,
          content: (
            <div>
              <div className="font-semibold text-text-primary mb-1">
                {d.emoji} {d.name} - Actual
              </div>
              <div className="text-text-secondary mb-1">{formatCurrency(d.actual)}</div>
              <div className={`text-sm ${difference > 0 ? 'text-danger' : difference < 0 ? 'text-success' : 'text-text-tertiary'}`}>
                {diffText}
              </div>
            </div>
          ),
        });
      })
      .on('mousemove', function (event) {
        setTooltip((prev) => ({ ...prev, x: event.pageX, y: event.pageY }));
      })
      .on('mouseleave', function (_, d) {
        const currentColor = d.actual > d.planned ? '#dc2626' : d.color;
        d3.select(this).attr('fill', currentColor);
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    // Legend
    const legend = svg
      .append('g')
      .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`);

    legend
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 16)
      .attr('height', 16)
      .attr('fill', '#d1d5db')
      .attr('rx', 3);

    legend
      .append('text')
      .attr('x', 22)
      .attr('y', 13)
      .text('Planned')
      .style('font-size', '12px')
      .style('fill', '#6b7280');

    legend
      .append('rect')
      .attr('x', 0)
      .attr('y', 24)
      .attr('width', 16)
      .attr('height', 16)
      .attr('fill', '#059669')
      .attr('rx', 3);

    legend
      .append('text')
      .attr('x', 22)
      .attr('y', 37)
      .text('Actual')
      .style('font-size', '12px')
      .style('fill', '#6b7280');
  }, [chartData, hasData]);

  if (!hasData) {
    return (
      <ChartEmptyState
        icon={<FaChartBar />}
        title="No spending data yet"
        message="Add transactions to your budget to see the comparison between planned and actual spending"
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
