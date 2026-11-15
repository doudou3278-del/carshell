(function(){
// All board geometry is in physical millimetres, converted to logical pixels only here.
// pixelRatio is used for the canvas backing buffer, never for physical calibration.
var DEFAULT_COLORS = { minor: '#13251d', major: '#214433', guides: '#00ff66', wheels: '#ffffff', reference: '#ffc66d' }
function normalizeColors(input) {
  var result = {}
  Object.keys(DEFAULT_COLORS).forEach(function(key) {
    var value = input && input[key]
    result[key] = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_COLORS[key]
  })
  return result
}
var LIMITS = {
  wheelbase: [50, 300], frontTrack: [30, 250], rearTrack: [30, 250],
  frontToe: [-5, 5], rearToe: [-10, 10], frontCamber: [-20, 20], rearCamber: [-20, 20], caster: [0, 25]
}
function validate(values) {
  var result = {}
  var keys = Object.keys(LIMITS)
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    var raw = values[key]
    // Older saved dimensions predate camber; retain them and default only the new fields.
    if ((key.indexOf('Camber') !== -1 || key === 'caster') && raw === undefined) raw = 0
    var value = Number(raw)
    if (raw === null || String(raw).trim() === '' || !isFinite(value) || value < LIMITS[key][0] || value > LIMITS[key][1]) return null
    result[key] = Math.round(value * 10) / 10
  }
  return result
}
function calibration(pxX, pxY) {
  if (!isFinite(pxX) || !isFinite(pxY) || pxX < 80 || pxY < 80 || pxX > 600 || pxY > 600) return null
  return { x: pxX / 50, y: pxY / 50 }
}
function viewportKey(device, window) {
  return [device.model || 'unknown', device.system || '', window.pixelRatio,
    window.screenWidth, window.screenHeight, window.windowWidth, window.windowHeight].join('|')
}
function geometry(width, height, scale, values) {
  return {
    centerX: width / 2, centerY: height / 2,
    wheelbasePx: values.wheelbase * scale.y,
    frontTrackPx: values.frontTrack * scale.x,
    rearTrackPx: values.rearTrack * scale.x,
    widthMm: width / scale.x, heightMm: height / scale.y,
    fits: (Math.max(values.frontTrack, values.rearTrack) + 30) * scale.x <= width &&
      (values.wheelbase + 50) * scale.y <= height
  }
}
function draw(ctx, width, height, scale, values, calibrated, reference, steering, transparentBackground, lineColors, extra) {
  extra = extra || {}
  var tireW = extra.tire && extra.tire.w > 0 ? extra.tire.w : 8, tireD = extra.tire && extra.tire.d > 0 ? extra.tire.d : 24
  var hw = tireW / 2, hd = tireD / 2
  var colors = normalizeColors(lineColors)
  if (steering) values = Object.assign({}, values, { frontTrack: steering.track })
  var g = geometry(width, height, scale, values)
  var cx = g.centerX, cy = g.centerY
  if (transparentBackground) ctx.clearRect(0, 0, width, height)
  else { ctx.fillStyle = '#080b0a'; ctx.fillRect(0, 0, width, height) }
  function line(x1, y1, x2, y2, color, weight) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = weight || 1
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }
  function text(value, x, y, color, align) {
    ctx.font = '11px sans-serif'; ctx.fillStyle = color || '#8a9a8a'
    ctx.textAlign = align || 'left'; ctx.fillText(value, x, y)
  }
  // Batch the grid into two strokes instead of stroking every millimetre line.
  var labels = []
  ;[false, true].forEach(function(major) {
    ctx.beginPath()
    ctx.strokeStyle = major ? colors.major : colors.minor
    ctx.lineWidth = major ? 1 : 0.5
    for (var mmX = Math.ceil(-cx / scale.x); mmX <= (width - cx) / scale.x; mmX++) {
      if ((mmX % 10 === 0) !== major) continue
      var x = cx + mmX * scale.x
      ctx.moveTo(x, 0); ctx.lineTo(x, height)
      if (major && x > 28 && x < width - 28) labels.push([String(mmX / 10), x + 3, 28])
    }
    for (var mmY = Math.ceil(-cy / scale.y); mmY <= (height - cy) / scale.y; mmY++) {
      if ((mmY % 10 === 0) !== major) continue
      var y = cy + mmY * scale.y
      ctx.moveTo(0, y); ctx.lineTo(width, y)
      if (major && y > 40 && y < height - 20) labels.push([String(-mmY / 10), 6, y - 4])
    }
    ctx.stroke()
  })
  labels.forEach(function(label) { text(label[0], label[1], label[2]) })
  ctx.setLineDash([6, 5])
  line(cx, 0, cx, height, colors.guides)
  line(0, cy, width, cy, colors.guides)
  ctx.setLineDash([])
  text('cm', 7, 14, colors.guides)
  text('车头 ↑', cx + 12, 48, colors.guides)
  function axle(front, track, toe) {
    var yy = cy + (front ? -1 : 1) * g.wheelbasePx / 2
    var half = track * scale.x / 2
    line(cx - half, yy, cx + half, yy, colors.guides, 1.5)
    text((front ? '前轮距 ' : '后轮距 ') + track + ' mm', cx, yy - 12, '#c8ffd9', 'center')
    ;[-1, 1].forEach(function(side) {
      var xx = cx + side * half
      line(xx - 5, yy, xx + 5, yy, '#567060', 1)
      line(xx, yy - 5, xx, yy + 5, '#567060', 1)
      // Toe is computed in physical coordinates so anisotropic calibration preserves angles.
      var angle = (front && steering ? (side === -1 ? steering.left : steering.right) : toe * side) * Math.PI / 180
      if (front && steering && steering.showScale) {
        // Protractor marks rotate in physical space before independent axis calibration.
        for (var degree = -85; degree <= 85; degree += 5) {
          var r = degree * Math.PI / 180, outer = 28, inner = degree % 10 === 0 ? 25 : 26.5
          line(xx - Math.sin(r) * inner * scale.x, yy - Math.cos(r) * inner * scale.y,
            xx - Math.sin(r) * outer * scale.x, yy - Math.cos(r) * outer * scale.y, '#496653', 0.8)
          if (degree % 30 === 0) text(String(degree) + '°', xx - Math.sin(r) * 32 * scale.x,
            yy - Math.cos(r) * 32 * scale.y, '#789481', 'center')
        }
      }
      if (front && steering && steering.target) {
        var neutral = toe * side * Math.PI / 180
        ctx.setLineDash([4, 4])
        line(xx - Math.sin(neutral) * 22 * scale.x, yy - Math.cos(neutral) * 22 * scale.y,
          xx + Math.sin(neutral) * 22 * scale.x, yy + Math.cos(neutral) * 22 * scale.y, colors.reference, 1)
        ctx.setLineDash([])
      }
      // Tire outlines are visual direction guides; rotate in mm before X/Y calibration.
      var corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function(point) {
        return [xx + (point[0] * Math.cos(angle) + point[1] * Math.sin(angle)) * scale.x,
          yy + (-point[0] * Math.sin(angle) + point[1] * Math.cos(angle)) * scale.y]
      })
      corners.forEach(function(point, index) {
        var next = corners[(index + 1) % corners.length]
        line(point[0], point[1], next[0], next[1], colors.wheels, front && steering ? 2.5 : 1.5)
      })
      var dx = Math.sin(angle) * (hd + 10) * scale.x
      var dy = Math.cos(angle) * (hd + 10) * scale.y
      line(xx - dx, yy - dy, xx + dx, yy + dy, colors.guides, 2)
    })
  }
  axle(true, values.frontTrack, values.frontToe)
  axle(false, values.rearTrack, values.rearToe)
  // Separate end views: camber is a tilt in the vertical plane, never plan-view yaw.
  // These 24mm guides use the existing physical scale, with illustrative spacing.
  ;[true, false].forEach(function(front) {
    var camber = Number(front ? values.frontCamber : values.rearCamber) || 0
    var yy = cy + (front ? -1 : 1) * g.wheelbasePx / 2 + (front ? 1 : -1) * Math.min(25, values.wheelbase / 5) * scale.y
    text((front ? '前' : '后') + ' Camber ' + camber + '° · 端视', cx, yy - 15 * scale.y, '#c8ffd9', 'center')
    ;[-1, 1].forEach(function(side) {
      var xx = cx + side * 12 * scale.x, r = side * camber * Math.PI / 180
      ctx.setLineDash([3, 3])
      line(xx, yy - 12 * scale.y, xx, yy + 12 * scale.y, colors.reference, 0.8)
      ctx.setLineDash([])
      line(xx + Math.sin(r) * 12 * scale.x, yy - Math.cos(r) * 12 * scale.y,
        xx - Math.sin(r) * 12 * scale.x, yy + Math.cos(r) * 12 * scale.y, colors.wheels, 2)
    })
  })
  if (extra.shell && extra.shell.wb > 0) {
    // Body arch centres (measured at the wheel arches) drawn over the chassis wheels.
    var sh = extra.shell, arch = '#ffc66d'
    ;[[true, sh.ft], [false, sh.rt]].forEach(function(pair) {
      if (!(pair[1] > 0)) return
      var yy = cy + (pair[0] ? -1 : 1) * sh.wb * scale.y / 2
      ;[-1, 1].forEach(function(side) {
        var xx = cx + side * pair[1] * scale.x / 2, rx = (hw + 3) * scale.x, ry = (hd + 3) * scale.y
        ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.strokeStyle = arch; ctx.lineWidth = 1.5
        if (ctx.ellipse) ctx.ellipse(xx, yy, rx, ry, 0, 0, Math.PI * 2); else ctx.rect(xx - rx, yy - ry, rx * 2, ry * 2)
        ctx.stroke(); ctx.setLineDash([])
        line(xx - 4, yy, xx + 4, yy, arch, 1); line(xx, yy - 4, xx, yy + 4, arch, 1)
      })
    })
    text('车壳轮眉' + (sh.name ? '：' + sh.name : ''), cx, cy - sh.wb * scale.y / 2 - hd * scale.y - 22, arch, 'center')
  }
  if (Number(values.caster)) text('Caster ' + values.caster + '°', cx + 12, cy + 28, '#c8ffd9')
  text('轴距 ' + values.wheelbase + ' mm', cx + 12, cy - 10, '#c8ffd9')
  text(steering ? (steering.sourceText || (steering.target ? '目标轮廓' : '转向参考')) + '：左 ' + steering.left + '° / 右 ' + steering.right + '°（含前束）' : '前束参考：前 ' + values.frontToe + '° / 后 ' + values.rearToe + '°', cx + 12, cy + 12)
  if (!calibrated) text('未校准 · 网格尺寸仅为示意', width / 2, height - 18, '#ffc66d', 'center')
  if (reference) {
    var rx = 40, ry = 64
    line(rx, ry, rx + reference.x, ry, colors.reference, 1)
    line(rx, ry, rx, ry + reference.y, colors.reference, 1)
    ;[rx, rx + reference.x].forEach(function(x) { line(x, ry - 7, x, ry + 7, colors.reference, 1) })
    ;[ry, ry + reference.y].forEach(function(y) { line(rx - 7, y, rx + 7, y, colors.reference, 1) })
    text('5 cm', rx + reference.x / 2, ry - 12, colors.reference, 'center')
    text('5 cm', rx + 10, ry + reference.y / 2, colors.reference)
  }
  return g
}
window.SetupBoard = { defaultColors: DEFAULT_COLORS, normalizeColors: normalizeColors, validate: validate, calibration: calibration, viewportKey: viewportKey, geometry: geometry, draw: draw }

})();
