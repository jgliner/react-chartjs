// Designed to be used with the current v2.0-dev version of Chart.js
// It's not on NPM, but if you'd like to use it you can, install it
// by setting the chart.js version in your package.json to:
// "chart.js": "git://github.com/danmolitor/Chart.js.git#v2.0-dev"

// I'll try to rework this for their 2.0.0 beta as well.

var React = require('react');
var ReactDOM = require('react-dom');
var Chart = require('chart.js');

function drawVert(me, eventPosition) {
  if (me.scales['y-axis-0']) {

    me.clear();
    me.draw();

    var yScale = me.scales['y-axis-0'];

    // Draw the vertical line here
    me.chart.ctx.beginPath();
    me.chart.ctx.moveTo(eventPosition.x, yScale.getPixelForValue(yScale.max));
    me.chart.ctx.strokeStyle = "#7D7D7D";
    me.chart.ctx.lineTo(eventPosition.x, yScale.getPixelForValue(yScale.min));
    me.chart.ctx.stroke();
  }
}

/* X-intercept hovering */
Chart.Controller.prototype.getElementsAtEvent = function(e) {
  var helpers = Chart.helpers;
  var eventPosition = helpers.getRelativePosition(e, this.chart);
  var elementsArray = [];

  var found = (function() {
    if (this.data.datasets) {
      for (var i = 0; i < this.data.datasets.length; i++) {
        var meta = this.getDatasetMeta(i);
        if (this.isDatasetVisible(i)) {
          for (var j = 0; j < meta.data.length; j++) {
            if (meta.data[j].inLabelRange(eventPosition.x, eventPosition.y)) {
              return meta.data[j];
            }
          }
        }
      }
    }
  }).call(this);

  if (!found) {
    return elementsArray;
  }

  helpers.each(this.data.datasets, function(dataset, dsIndex) {
    if (this.isDatasetVisible(dsIndex)) {
      var meta = this.getDatasetMeta(dsIndex);
      elementsArray.push(meta.data[found._index]);
    }
  }, this);

  return elementsArray;
};

/*
  Override default eventHandler to add vert in Line Charts
  (NOTE: the only conditional for this is chartInstance.scales['y-axis-0']
  When we add more graph types (namely bar), we'll need to check for Chart.type as well
*/
Chart.Controller.prototype.eventHandler = function(e) {
  var helpers = Chart.helpers;
  var me = this;
  var tooltip = me.tooltip;
  var options = me.options || {};
  var hoverOptions = options.hover;
  var tooltipsOptions = options.tooltips;
  var eventPosition = helpers.getRelativePosition(e, this.chart);

  me.lastActive = me.lastActive || [];
  me.lastTooltipActive = me.lastTooltipActive || [];

  // Find Active Elements for hover and tooltips
  if (e.type === 'mouseout') {
    me.active = [];
    me.tooltipActive = [];
  } else {
    me.active = me.getElementsAtEventForMode(e, hoverOptions.mode);
    me.tooltipActive =  me.getElementsAtEventForMode(e, tooltipsOptions.mode);
  }

  // On Hover hook
  if (hoverOptions.onHover) {
    hoverOptions.onHover.call(me, me.active);
  }

  if (e.type === 'mouseup' || e.type === 'click') {
    if (options.onClick) {
      options.onClick.call(me, e, me.active);
    }
    if (me.legend && me.legend.handleEvent) {
      me.legend.handleEvent(e);
    }
  }

  // Remove styling for last active (even if it may still be active)
  if (me.lastActive.length) {
    me.updateHoverStyle(me.lastActive, hoverOptions.mode, false);
  }

  // Built in hover styling
  if (me.active.length && hoverOptions.mode) {
    me.updateHoverStyle(me.active, hoverOptions.mode, true);
  }

  // Built in Tooltips
  if (tooltipsOptions.enabled || tooltipsOptions.custom) {
    tooltip.initialize();
    tooltip._active = me.tooltipActive;
    tooltip.update(true);
  }


  // Hover animations
  tooltip.pivot();

  if (!me.animating) {
    // If entering, leaving, or changing elements, animate the change via pivot
    if (!helpers.arrayEquals(me.active, me.lastActive) ||
      !helpers.arrayEquals(me.tooltipActive, me.lastTooltipActive)) {

      me.stop();

      if (tooltipsOptions.enabled || tooltipsOptions.custom) {
        tooltip.update(true);
      }

      // We only need to render at this point. Updating will cause scales to be
      // recomputed generating flicker & using more memory than necessary.

      // STAGE.GG: override call below - Redux handles this
      // me.render(hoverOptions.animationDuration, true);
    }
  }

  drawVert(me, eventPosition);
  // Remember Last Actives
  me.lastActive = me.active;
  me.lastTooltipActive = me.tooltipActive;
  return me;
}


module.exports = {
  createClass: function(chartType, methodNames, dataKey) {
    var classData = {
      displayName: chartType + 'Chart',
      getInitialState: function() { return {}; },
      render: function() {
        var _props = {
          ref: 'canvass'
        };
        for (var name in this.props) {
          if (this.props.hasOwnProperty(name)) {
            if (name !== 'data' && name !== 'options') {
              _props[name] = this.props[name];
            }
          }
        }
        return React.createElement('canvas', _props);
      }
    };

    var extras = ['clear', 'stop', 'resize', 'toBase64Image', 'generateLegend', 'update', 'addData', 'removeData'];
    function extra(type) {
      classData[type] = function() {
        return this.state.chart[type].apply(this.state.chart, arguments);
      };
    }

    classData.componentDidMount = function() {
      this.initializeChart(this.props);
    };


    classData.componentWillUnmount = function() {
      var chart = this.state.chart;
      chart.destroy();
    };

    classData.componentWillReceiveProps = function(nextProps) {
      var chart = this.state.chart;
      var optsChange = JSON.stringify(nextProps.options) !== JSON.stringify(this.props.options);

      if (nextProps.redraw || optsChange) {
        chart.destroy();  // Reset the array of datasets
        this.initializeChart(nextProps);
      } else {
        // assign all of the properites from the next datasets to the current chart
        nextProps.data.datasets.forEach(function(set, setIndex) {

          var chartDataset = {};

          for (var property in set) {
            if (set.hasOwnProperty(property)) {
              chartDataset[property] = set[property];
            }
          }

          chart.data.datasets[setIndex] = chartDataset;
        });

        chart.data.labels = nextProps.data.labels;

        chart.update();
      }
  };

    classData.initializeChart = function(nextProps) {
      var el = ReactDOM.findDOMNode(this);
      var ctx = el.getContext("2d");
      var convertToType = function(string) {
        if(string === 'PolarArea') { return 'polarArea'; }
        if(string === 'HorizontalBar') { return 'horizontalBar'; }
        return string.toLowerCase();
      };
      var type = convertToType(chartType);

      this.state.chart = new Chart(ctx, {
        type: type,
        data: nextProps.data,
        options: nextProps.options
      });
    };


    // return the chartjs instance
    classData.getChart = function() {
      return this.state.chart;
    };

    // return the canvass element that contains the chart
    classData.getCanvass = function() {
      return this.refs.canvass;
    };

    classData.getCanvas = classData.getCanvass;

    var i;
    for (i=0; i<extras.length; i++) {
      extra(extras[i]);
    }
    for (i=0; i<methodNames.length; i++) {
      extra(methodNames[i]);
    }

    return React.createClass(classData);
  }
};
