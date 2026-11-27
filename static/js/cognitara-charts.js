/**
 * CogniTara Editorial Data Visualization Engine (Chart.js 4)
 * ---------------------------------------------------------------------------
 * Publication-grade, theme-reactive academic charts inspired by Stripe Sigma,
 * Vercel Analytics, Linear Insights, and Tremor.
 * - Live MutationObserver dark/light theme synchronization (zero reload needed)
 * - Whisper-fine dashed hairlines, zero axis spine clutter, tabular Geist Mono
 * - Built-in Center KPI Donut plugin & 50% Pass Benchmark reference line plugin
 * - 100% offline using bundled vendor/chartjs/chart.umd.min.js
 */
(function (window) {
  "use strict";

  var instances = [];

  function isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  function palette() {
    var light = isLight();
    return {
      light: light,
      surface: light ? "#FFFFFF" : "#1B1B1E",
      tooltipBg: light ? "#171614" : "#242427",
      tooltipInk: "#F5F5F4",
      tooltipSub: "#A8A6A1",
      tooltipBorder: light ? "rgba(23,22,20,0.12)" : "rgba(255,255,255,0.09)",
      ink: light ? "#171614" : "#F5F5F4",
      ink2: light ? "#575551" : "#A8A6A1",
      ink3: light ? "#83807B" : "#76746F",
      grid: light ? "rgba(23, 22, 20, 0.06)" : "rgba(255, 255, 255, 0.06)",
      benchLine: light ? "rgba(23, 22, 20, 0.24)" : "rgba(245, 245, 244, 0.22)",
      benchLabel: light ? "#575551" : "#A8A6A1",
      avgLine: light ? "rgba(23, 22, 20, 0.42)" : "rgba(245, 245, 244, 0.42)",
      grades: {
        A: light ? "#171614" : "#F5F5F4",
        B: light ? "#3D3B37" : "#C8C6C1",
        C: light ? "#63605B" : "#9B9994",
        D: light ? "#8B8780" : "#716F6B",
        E: light ? "#B4B0A8" : "#504F4B",
        F: light ? "#D5D2CC" : "#343330"
      },
      tierColor: function (val) {
        if (val >= 75) return light ? "#171614" : "#F5F5F4";
        if (val >= 60) return light ? "#44423E" : "#C5C3BE";
        if (val >= 50) return light ? "#787570" : "#8F8D88";
        return light ? "#ACA8A0" : "#565552";
      },
      tierSoft: function (val) {
        if (val >= 75) return light ? "rgba(23, 22, 20, 0.90)" : "rgba(245, 245, 244, 0.88)";
        if (val >= 60) return light ? "rgba(23, 22, 20, 0.68)" : "rgba(245, 245, 244, 0.66)";
        if (val >= 50) return light ? "rgba(23, 22, 20, 0.46)" : "rgba(245, 245, 244, 0.44)";
        return light ? "rgba(23, 22, 20, 0.26)" : "rgba(245, 245, 244, 0.26)";
      }
    };
  }

  function gradeColor(label, pal) {
    var k = String(label || "").trim().charAt(0).toUpperCase();
    return pal.grades[k] || pal.grades.B;
  }

  /* Custom Plugin: Centered KPI Typography inside Precision Ring */
  var centerTextPlugin = {
    id: "ctCenterText",
    afterDraw: function (chart, _args, opts) {
      if (!opts || !opts.value) return;
      var meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data || !meta.data.length) return;
      var cx = meta.data[0].x;
      var cy = meta.data[0].y;
      var ctx = chart.ctx;
      var pal = palette();
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = pal.ink;
      ctx.font = '700 26px "Geist Mono", ui-monospace, monospace';
      ctx.fillText(String(opts.value), cx, cy - 8);
      if (opts.label) {
        ctx.fillStyle = pal.ink3;
        ctx.font = '600 10px "Geist Mono", ui-monospace, monospace';
        ctx.fillText(String(opts.label).toUpperCase(), cx, cy + 16);
      }
      ctx.restore();
    }
  };

  /* Custom Plugin: Subtle 50% Pass Benchmark & Average Reference Lines */
  var benchmarkPlugin = {
    id: "ctBenchmark",
    afterDatasetsDraw: function (chart, _args, opts) {
      if (!opts) return;
      var ctx = chart.ctx;
      var area = chart.chartArea;
      if (!area) return;
      var pal = palette();
      var isHoriz = chart.options.indexAxis === "y";
      var scale = isHoriz ? chart.scales.x : chart.scales.y;
      if (!scale) return;

      function drawRef(val, text, color, alignRight) {
        if (val === undefined || val === null || isNaN(val)) return;
        var pos = scale.getPixelForValue(val);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        if (isHoriz) {
          ctx.moveTo(pos, area.top);
          ctx.lineTo(pos, area.bottom);
        } else {
          ctx.moveTo(area.left, pos);
          ctx.lineTo(area.right, pos);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (text && (!(!isHoriz && area.width < 320))) {
          ctx.fillStyle = pal.benchLabel;
          ctx.strokeStyle = pal.surface;
          ctx.lineWidth = 3.5;
          ctx.lineJoin = "round";
          ctx.font = '600 9.5px "Geist Mono", ui-monospace, monospace';
          if (isHoriz) {
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.strokeText(text, pos, area.top - 5);
            ctx.fillText(text, pos, area.top - 5);
          } else {
            ctx.textAlign = alignRight ? "right" : "left";
            ctx.textBaseline = "bottom";
            var tx = alignRight ? area.right - 2 : area.left + 4;
            ctx.strokeText(text, tx, pos - 4);
            ctx.fillText(text, tx, pos - 4);
          }
        }
        ctx.restore();
      }

      if (opts.passMark !== undefined) {
        drawRef(opts.passMark, opts.passLabel || "50% PASS", pal.benchLine, false);
      }
      if (opts.avgValue !== undefined && opts.avgValue > 0) {
        drawRef(opts.avgValue, opts.avgLabel || ("AVG " + opts.avgValue + "%"), pal.avgLine, true);
      }
    }
  };

  /* Custom Plugin: Crisp Direct Tabular Mono Value Labels on Bars */
  var barValuePlugin = {
    id: "ctBarValues",
    afterDatasetsDraw: function (chart, _args, opts) {
      if (opts && opts.enabled === false) return;
      var meta = chart.getDatasetMeta(0);
      var ds = chart.data.datasets[0];
      if (!meta || !meta.data || !ds) return;
      var pal = palette();
      var ctx = chart.ctx;
      var isHoriz = chart.options.indexAxis === "y";
      var unit = (opts && opts.unit !== undefined) ? opts.unit : "%";

      ctx.save();
      ctx.font = '600 11px "Geist Mono", ui-monospace, monospace';
      ctx.fillStyle = pal.ink2;

      meta.data.forEach(function (bar, i) {
        var raw = Number(ds.data[i]);
        if (isNaN(raw)) return;
        var label = (raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(1)) + unit;
        if (isHoriz) {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(label, bar.x + 8, bar.y);
        } else {
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(label, bar.x, bar.y - 6);
        }
      });
      ctx.restore();
    }
  };

  function commonTooltip(pal, unitSuffix) {
    return {
      enabled: true,
      backgroundColor: pal.tooltipBg,
      titleColor: pal.tooltipInk,
      bodyColor: pal.tooltipSub,
      borderColor: pal.tooltipBorder,
      borderWidth: 1,
      padding: { top: 9, right: 12, bottom: 9, left: 12 },
      cornerRadius: 10,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
      boxPadding: 5,
      titleFont: { family: '"Plus Jakarta Sans", sans-serif', size: 12, weight: "600" },
      bodyFont: { family: '"Geist Mono", monospace', size: 12, weight: "600" },
      callbacks: {
        label: function (ctx) {
          var v = ctx.parsed && typeof ctx.parsed === "object"
            ? (ctx.chart.options.indexAxis === "y" ? ctx.parsed.x : ctx.parsed.y)
            : ctx.parsed;
          var label = ctx.dataset && ctx.dataset.label ? ctx.dataset.label + ": " : "";
          return " " + label + (typeof v === "number" ? v.toFixed(v % 1 === 0 ? 0 : 1) : v) + (unitSuffix || "");
        }
      }
    };
  }

  function register(entry) {
    instances.push(entry);
    return entry.chart;
  }

  function destroyOnCanvas(canvasId) {
    for (var i = instances.length - 1; i >= 0; i--) {
      if (instances[i].id === canvasId) {
        try { instances[i].chart.destroy(); } catch (e) {}
        instances.splice(i, 1);
      }
    }
  }

  /* 1. Precision Grade Distribution Ring + Structured Side Legend */
  function renderGradeRing(canvasId, legendId, cfg) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return null;
    destroyOnCanvas(canvasId);

    var labels = cfg.labels || [];
    var counts = cfg.counts || [];
    var total = counts.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
    var pal = palette();

    var colors = labels.map(function (l) { return gradeColor(l, pal); });
    var hasData = total > 0;
    var plotData = hasData ? counts : [1];
    var plotColors = hasData ? colors : [pal.grid];

    var chart = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: hasData ? labels : ["No grades"],
        datasets: [{
          data: plotData,
          backgroundColor: plotColors,
          borderColor: pal.surface,
          borderWidth: hasData ? 3 : 0,
          borderRadius: hasData ? 5 : 0,
          hoverOffset: hasData ? 4 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "74%",
        animation: { duration: 760, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: hasData ? commonTooltip(pal, " students") : { enabled: false },
          ctCenterText: {
            value: cfg.centerValue !== undefined ? cfg.centerValue : String(total),
            label: cfg.centerLabel || "Graded"
          }
        }
      },
      plugins: [centerTextPlugin]
    });

    /* Render clean structured Breakdown Legend */
    var leg = legendId ? document.getElementById(legendId) : null;
    if (leg) {
      var names = { A: "Grade A", B: "Grade B", C: "Grade C", D: "Grade D", F: "Grade F" };
      var html = "";
      for (var i = 0; i < labels.length; i++) {
        var lbl = String(labels[i]);
        var cnt = Number(counts[i]) || 0;
        var share = total > 0 ? Math.round((cnt / total) * 100) : 0;
        var col = colors[i];
        html += '<div class="tc-legend-row">' +
          '<span class="tc-legend-dot" style="background:' + col + '"></span>' +
          '<span class="tc-legend-label">' + (names[lbl] || lbl) + '</span>' +
          '<span class="tc-legend-track"><i style="width:' + share + '%;background:' + col + '"></i></span>' +
          '<span class="tc-legend-val">' + cnt + ' · ' + share + '%</span>' +
          '</div>';
      }
      if (!labels.length) {
        html = '<div style="font-size:12.5px;color:var(--tc-ink-3)">No graded attempts recorded yet.</div>';
      }
      leg.innerHTML = html;
    }

    return register({
      id: canvasId,
      chart: chart,
      retheme: function () { renderGradeRing(canvasId, legendId, cfg); }
    });
  }

  /* 2. Horizontal Mastery Bar Chart (Sections / Students / Exams) */
  function renderHorizontalBars(canvasId, cfg) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return null;
    destroyOnCanvas(canvasId);

    var pal = palette();
    var narrow = (canvas.parentElement && canvas.parentElement.clientWidth < 460) || window.innerWidth < 540;
    var maxLen = narrow ? 15 : 26;
    var labels = (cfg.labels || []).map(function (s) {
      s = String(s || "");
      return s.length > maxLen ? s.slice(0, maxLen - 1).trim() + "…" : s;
    });
    var values = (cfg.values || []).map(function (v) { return Number(v) || 0; });
    var rowHeight = cfg.rowHeight || 34;
    var minHeight = cfg.minHeight || 250;
    var computedHeight = Math.max(minHeight, labels.length * rowHeight + 56);
    if (canvas.parentElement) {
      canvas.parentElement.style.height = computedHeight + "px";
      canvas.parentElement.style.minHeight = computedHeight + "px";
    }

    var chart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: cfg.seriesLabel || "Score",
          data: values,
          backgroundColor: values.map(function (v) { return pal.tierSoft(v); }),
          hoverBackgroundColor: values.map(function (v) { return pal.tierColor(v); }),
          borderRadius: 6,
          borderSkipped: false,
          barThickness: values.length > 10 ? 18 : 22,
          maxBarThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        layout: { padding: { top: 22, right: narrow ? 46 : 52, bottom: 4, left: 4 } },
        animation: { duration: 700, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: commonTooltip(pal, cfg.unit || "%"),
          ctBenchmark: {
            passMark: cfg.passMark !== undefined ? cfg.passMark : 50,
            passLabel: cfg.passLabel || "50% PASS"
          },
          ctBarValues: {
            enabled: cfg.showValues !== false,
            unit: cfg.unit || "%"
          }
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            border: { display: false },
            grid: { color: pal.grid, tickLength: 0 },
            ticks: {
              stepSize: 25,
              color: pal.ink3,
              font: { family: '"Geist Mono", monospace', size: 10.5 },
              callback: function (v) { return v + "%"; }
            }
          },
          y: {
            border: { display: false },
            grid: { display: false },
            ticks: {
              color: pal.ink2,
              font: { family: '"Plus Jakarta Sans", sans-serif', size: narrow ? 11 : 12, weight: "560" },
              padding: narrow ? 4 : 8
            }
          }
        }
      },
      plugins: [benchmarkPlugin, barValuePlugin]
    });

    return register({
      id: canvasId,
      chart: chart,
      retheme: function () { renderHorizontalBars(canvasId, cfg); }
    });
  }

  /* 3. Vertical Editorial Column Chart (Exam Performance Overview on Dashboard) */
  function renderVerticalBars(canvasId, cfg) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return null;
    destroyOnCanvas(canvasId);

    var pal = palette();
    var narrow = (canvas.parentElement && canvas.parentElement.clientWidth < 460) || window.innerWidth < 540;
    var maxLen = narrow ? 13 : 20;
    var labels = (cfg.labels || []).map(function (s) {
      s = String(s || "");
      return s.length > maxLen ? s.slice(0, maxLen - 1).trim() + "…" : s;
    });
    var values = (cfg.values || []).map(function (v) { return Number(v) || 0; });

    var chart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: cfg.seriesLabel || "Average Score",
          data: values,
          backgroundColor: values.map(function (v) { return v > 0 ? pal.tierSoft(v) : pal.grid; }),
          hoverBackgroundColor: values.map(function (v) { return v > 0 ? pal.tierColor(v) : pal.ink3; }),
          borderRadius: { topLeft: 7, topRight: 7, bottomLeft: 2, bottomRight: 2 },
          borderSkipped: false,
          maxBarThickness: 42
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24, right: 10, bottom: 0, left: 0 } },
        animation: { duration: 760, easing: "easeOutQuart" },
        plugins: {
          legend: { display: false },
          tooltip: commonTooltip(pal, cfg.unit || "%"),
          ctBenchmark: {
            passMark: cfg.passMark !== undefined ? cfg.passMark : 50,
            passLabel: cfg.passLabel || "50% PASS",
            avgValue: cfg.avgValue,
            avgLabel: cfg.avgLabel
          },
          ctBarValues: {
            enabled: cfg.showValues !== false,
            unit: cfg.unit || "%"
          }
        },
        scales: {
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: {
              color: pal.ink2,
              font: { family: '"Plus Jakarta Sans", sans-serif', size: 11.5, weight: "560" },
              padding: 6
            }
          },
          y: {
            min: 0,
            max: 100,
            border: { display: false },
            grid: { color: pal.grid, tickLength: 0 },
            ticks: {
              stepSize: 25,
              color: pal.ink3,
              font: { family: '"Geist Mono", monospace', size: 10.5 },
              padding: 8,
              callback: function (v) { return v + "%"; }
            }
          }
        }
      },
      plugins: [benchmarkPlugin, barValuePlugin]
    });

    return register({
      id: canvasId,
      chart: chart,
      retheme: function () { renderVerticalBars(canvasId, cfg); }
    });
  }

  /* Live Theme Switch Observer - re-renders charts smoothly when data-theme toggles */
  var lastTheme = document.documentElement.getAttribute("data-theme");
  var observer = new MutationObserver(function () {
    var next = document.documentElement.getAttribute("data-theme");
    if (next !== lastTheme) {
      lastTheme = next;
      var copy = instances.slice();
      copy.forEach(function (entry) {
        if (entry && typeof entry.retheme === "function") entry.retheme();
      });
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  window.CogniTaraCharts = {
    gradeRing: renderGradeRing,
    horizontalBars: renderHorizontalBars,
    verticalBars: renderVerticalBars,
    destroy: destroyOnCanvas
  };
})(window);
