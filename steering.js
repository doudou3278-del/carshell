// Ported verbatim from the mini program's utils/ (steering-profile, rack-steering, rc-setup-tools, rdx-steering-reference, tablet-calibration).
window.SteeringProfile = (function () { var module = { exports: {} };
// A digital alignment gauge, NOT a suspension/linkage solver. All yaw angles
// are absolute ground-plane wheel headings: positive points left of centreline.
var MAX_POINTS = 49
function number(raw, min, max) {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || String(raw).trim() === '') return null
  var n = Number(raw)
  return isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 || 0 : null
}
function context(dimensions, alignment) {
  alignment = alignment || {}
  var c = { wheelbase: number(dimensions.wheelbase, 50, 300), track: number(dimensions.frontTrack, 30, 250), toe: number(dimensions.frontToe, -5, 5) }
  if (c.wheelbase === null || c.track === null || c.toe === null) return null
  var fields = ['camberLeft', 'camberRight', 'casterLeft', 'casterRight']
  for (var i = 0; i < fields.length; i++) {
    var key = fields[i], raw = alignment[key], limit = key.indexOf('camber') === 0 ? 20 : 30
    c[key] = raw === '' || raw === null || raw === undefined ? '' : number(raw, -limit, limit)
    if (c[key] === null) return null
  }
  return c
}
function sameContext(a, b) { return !!a && !!b && JSON.stringify(a) === JSON.stringify(b) }
function point(raw) {
  if (!raw) return null
  var p = { position: number(raw.position, -100, 100), left: number(raw.left, -85, 85), right: number(raw.right, -85, 85) }
  return p.position === null || p.left === null || p.right === null ? null : p
}
function restore(raw) {
  if (!raw || ['reference', 'measured'].indexOf(raw.kind) < 0 || !raw.context || !Array.isArray(raw.points) || raw.points.length > MAX_POINTS) return null
  var c = context({ wheelbase: raw.context.wheelbase, frontTrack: raw.context.track, frontToe: raw.context.toe }, raw.context)
  if (!c) return null
  var points = [], seen = {}
  for (var i = 0; i < raw.points.length; i++) {
    var p = point(raw.points[i])
    if (!p || seen[p.position]) return null
    seen[p.position] = true; points.push(p)
  }
  points.sort(function(a, b) { return a.position - b.position })
  if (raw.kind === 'reference' && !points.some(function(p) { return p.position === 0 && p.left === -c.toe && p.right === c.toe })) return null
  return { kind: raw.kind, context: c, points: points }
}
function create(c, kind) {
  if (!c) return null
  // Generic comparison targets only. No manufacturer/model-specific preset.
  var points = kind === 'measured' ? [] : [
    { position: -100, left: 60 - c.toe, right: 60 + c.toe },
    { position: 0, left: -c.toe, right: c.toe },
    { position: 100, left: -60 - c.toe, right: -60 + c.toe }
  ]
  return restore({ kind: kind || 'reference', context: c, points: points })
}
function insert(profile, p) {
  profile = restore(profile); p = point(p)
  if (!profile || !p) return { error: '轮角需在 −85～85°，转向位置需在 −100～100%' }
  if (profile.kind === 'reference' && p.position === 0) return { error: '回中方向由前束决定，请先转动方向盘' }
  var index = profile.points.findIndex(function(existing) { return existing.position === p.position })
  if (index < 0 && profile.points.length >= MAX_POINTS) return { error: '一组最多保存 49 个位置' }
  if (index < 0) profile.points.push(p)
  else profile.points[index] = p
  profile.points.sort(function(a, b) { return a.position - b.position })
  return { profile: profile, position: p.position }
}
function recontextReference(profile, c) {
  profile = restore(profile)
  if (!profile || profile.kind !== 'reference' || !c) return create(c, 'reference')
  // These are user targets, not measured suspension predictions. Preserve
  // non-neutral target headings; only the neutral pose follows the new Toe.
  profile.context = c
  profile.points = profile.points.map(function(p) { return p.position === 0 ? { position: 0, left: -c.toe, right: c.toe } : p })
  return restore(profile)
}
function stagedReference(c, input, maximum) {
  maximum = maximum === undefined ? 60 : number(maximum, 3, 85)
  if (!c) return { error: '定位值无效，请检查高级设置' }
  if (maximum === null) return { error: '末端内轮角需在 3～85°' }
  var profile = create(c, 'reference'), stages = {}, keys = ['early', 'middle', 'end'], positions = [20, 50, 100], labels = ['初段', '中段', '末端']
  for (var i = 0; i < keys.length; i++) {
    var difference = number(input[keys[i]], -170, 170)
    if (difference === null) return { error: '请填写' + labels[i] + '的目标角差' }
    stages[keys[i]] = difference
    // User-selected comparison targets; not inferred steering-linkage kinematics.
    var inner = Math.round((-c.toe + (maximum + c.toe) * positions[i] / 100) * 10) / 10
    var outer = Math.round((inner - difference) * 10) / 10
    var left = insert(profile, { position: -positions[i], left: inner, right: outer })
    if (left.error) return { error: labels[i] + '的角差使轮角超出 −85～85°' }
    var right = insert(left.profile, { position: positions[i], left: -outer, right: -inner })
    if (right.error) return { error: labels[i] + '的角差使轮角超出 −85～85°' }
    profile = right.profile
  }
  return { profile: profile, stages: stages, maximum: maximum }
}
function sample(profile, position, c) {
  profile = restore(profile); position = number(position, -100, 100)
  if (!profile || position === null) return { error: '还没有有效的转向记录' }
  if (!sameContext(profile.context, c)) return { error: '定位或尺寸已变化，请开始新一组实测' }
  var points = profile.points, pair = null, interpolated = false
  for (var i = 0; i < points.length; i++) {
    if (points[i].position === position) { pair = points[i]; break }
    if (i > 0 && points[i - 1].position < position && position < points[i].position) {
      var a = points[i - 1], b = points[i]
      if (profile.kind === 'measured' && a.position < 0 && b.position > 0) return { error: '请先记录回中，左右转向分开测量' }
      var t = (position - a.position) / (b.position - a.position)
      pair = { position: position, left: a.left + (b.left - a.left) * t, right: a.right + (b.right - a.right) * t }
      interpolated = true; break
    }
  }
  if (!pair) return { error: '该位置超出已测范围，不推算未测转向' }
  var left = Math.round(pair.left * 10) / 10 || 0, right = Math.round(pair.right * 10) / 10 || 0
  var direction = position > 0 ? 'right' : 'left'
  var inner = direction === 'left' ? left : -right, outer = direction === 'left' ? right : -left
  var percent = null, rad = Math.PI / 180
  if (position !== 0 && inner > 0 && outer > 0) percent = (1 / Math.tan(outer * rad) - 1 / Math.tan(inner * rad)) * c.wheelbase / c.track * 100
  var difference = Math.round((left - right) * 10) / 10
  return { result: { left: left, right: right, inner: inner, outer: outer, position: position,
    difference: difference.toFixed(1), percent: percent === null ? '—' : percent.toFixed(1) + '%',
    relation: position === 0 ? '回中' : inner < 0 || outer < 0 ? '两轮异向' : difference === 0 ? '平行' : difference > 0 ? '正阿克曼' : '反阿克曼',
    track: c.track, toe: c.toe, target: profile.kind === 'reference', kind: profile.kind,
    interpolated: interpolated, direction: direction, leftChange: (left + c.toe).toFixed(1), rightChange: (right - c.toe).toFixed(1),
    sourceText: profile.kind === 'reference' ? '自定目标' : interpolated ? '实测点间线性对照' : '实测记录' } }
}
function edit(profile, position, changes) {
  profile = restore(profile)
  if (!profile || profile.kind !== 'reference') return { error: '实测回放不能改写轮角，请切换自定目标' }
  position = number(position, -100, 100)
  if (position === 0) return { error: '先转一点方向盘，再调整轮差；回中由前束决定' }
  var at = sample(profile, position, profile.context)
  if (!at.result) return at
  var pair = { position: position, left: at.result.left, right: at.result.right }
  if (Object.prototype.hasOwnProperty.call(changes, 'difference')) {
    var difference = number(changes.difference, -170, 170)
    if (difference === null) return { error: '请填写有效角差' }
    // Keep the current inner wheel as the anchor; avoid accumulating rounding
    // drift by moving both wheels half a tenth on every 0.1° difference edit.
    if (position < 0) pair.right = pair.left - difference
    else pair.left = pair.right + difference
  } else {
    if (Object.prototype.hasOwnProperty.call(changes, 'left')) pair.left = changes.left
    if (Object.prototype.hasOwnProperty.call(changes, 'right')) pair.right = changes.right
  }
  var changed = insert(profile, pair)
  return changed
}
function rows(profile) {
  profile = restore(profile)
  return !profile ? [] : profile.points.map(function(p) {
    var result = sample(profile, p.position, profile.context).result
    return { position: p.position, label: p.position === 0 ? '回中' : (p.position < 0 ? '左 ' : '右 ') + Math.abs(p.position) + '%',
      left: p.left, right: p.right, difference: result.difference }
  })
}
function symmetry(profile) {
  profile = restore(profile)
  if (!profile || profile.kind !== 'measured') return []
  return profile.points.filter(function(p) { return p.position < 0 }).map(function(leftTurn) {
    var rightTurn = profile.points.find(function(p) { return p.position === -leftTurn.position })
    if (!rightTurn) return null
    return { position: -leftTurn.position,
      inner: (Math.abs(leftTurn.left) - Math.abs(rightTurn.right)).toFixed(1),
      outer: (Math.abs(leftTurn.right) - Math.abs(rightTurn.left)).toFixed(1) }
  }).filter(function(row) { return !!row })
}
module.exports = { number: number, context: context, sameContext: sameContext, restore: restore, create: create,
  insert: insert, sample: sample, edit: edit, rows: rows, symmetry: symmetry, recontextReference: recontextReference, stagedReference: stagedReference }
return module.exports; })();
window.RackSteering = (function () { var module = { exports: {} };
// Symmetric planar sliding-rack linkage, millimetres. X right, Y rearward.
// Kingpin spacing is measured at steering pivots, not tire centres.
var fields = ['pivotWidth', 'rackWidth', 'rackOffset', 'armInward', 'armRearward', 'travel']
function validate(input) {
  var out = {}
  for (var i = 0; i < fields.length; i++) {
    var key = fields[i], raw = input && input[key]
    if ((typeof raw === 'string' && !raw.trim()) || raw === '' || raw === null || raw === undefined || !isFinite(Number(raw))) return null
    out[key] = Number(raw)
    if (Math.abs(out[key]) > 300) return null
  }
  if (out.pivotWidth <= 0 || out.rackWidth < 0 || out.rackWidth >= out.pivotWidth || out.travel <= 0 ||
      Math.hypot(out.armInward, out.armRearward) < 0.1) return null
  return out
}
function rotate(x, y, angle) {
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]
}
function nearest(angle, previous) {
  return previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous))
}
function wheel(g, side, toe, displacement) {
  var neutral = -side * toe * Math.PI / 180
  var arm = [-side * g.armInward, g.armRearward]
  var atCenter = rotate(arm[0], arm[1], neutral)
  var baseX = side * (g.rackWidth - g.pivotWidth) / 2
  var lengthSquared = Math.pow(atCenter[0] - baseX, 2) + Math.pow(atCenter[1] - g.rackOffset, 2)
  var radius = Math.hypot(arm[0], arm[1]), previous = neutral
  // Follow the connected assembly branch from centre; never jump across a toggle.
  var steps = Math.max(1, Math.ceil(Math.abs(displacement) / 0.1))
  for (var i = 0; i <= steps; i++) {
    var x = baseX + displacement * i / steps, y = g.rackOffset
    var distance = Math.hypot(x, y)
    if (distance < 1e-8) return null
    var cosine = (radius * radius + distance * distance - lengthSquared) / (2 * radius * distance)
    if (cosine <= -1 + 1e-8 || cosine >= 1 - 1e-8) return null
    var bearing = Math.atan2(y, x) - Math.atan2(arm[1], arm[0])
    var opening = Math.acos(cosine)
    var a = nearest(bearing + opening, previous), b = nearest(bearing - opening, previous)
    var angle = Math.abs(a - previous) < Math.abs(b - previous) ? a : b
    if (Math.abs(angle - previous) > 0.15 || Math.abs(angle) > 85 * Math.PI / 180) return null
    previous = angle
  }
  return -previous * 180 / Math.PI
}
function sample(input, position, toe, track) {
  var g = validate(input)
  if (!g || !isFinite(Number(toe)) || Math.abs(Number(toe)) > 5) return { error: '请填写有效的横杆几何尺寸。' }
  // Map a rightward handwheel gesture to rightward wheel yaw for either
  // front-mounted or rear-mounted racks. Actual rack motion may be reversed.
  var smallLeft = wheel(g, -1, Number(toe), 0.001), smallRight = wheel(g, 1, Number(toe), 0.001)
  if (smallLeft === null || smallRight === null || Math.abs(smallLeft + smallRight) < 1e-8)
    return { error: '回中位置接近连杆死点，请检查球头位置。' }
  var direction = smallLeft + smallRight > 0 ? -1 : 1
  var displacement = direction * Math.max(-100, Math.min(100, Number(position) || 0)) / 100 * g.travel
  var left = wheel(g, -1, Number(toe), displacement), right = wheel(g, 1, Number(toe), displacement)
  if (left === null || right === null) return { error: '此行程超出连杆可达范围或接近死点，请减小横杆行程并检查尺寸。' }
  return { result: { left: Math.round(left * 10) / 10 || 0, right: Math.round(right * 10) / 10 || 0,
    track: track, sourceText: '横杆几何 · 平面计算', target: false, showScale: false } }
}
module.exports = { validate: validate, sample: sample }
return module.exports; })();
window.SetupTools = (function () { var module = { exports: {} };
function finite(raw, low, high) {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || String(raw).trim() === '') return null
  var n = Number(raw)
  return isFinite(n) && n >= low && n <= high ? n : null
}
// Symmetric toe, measured across the same front/rear points on both wheels.
// rearGap - frontGap = 2 * measurementBaseline * sin(singleSideToe).
function toe(input) {
  var front = finite(input.front, 0, 1000), rear = finite(input.rear, 0, 1000), diameter = finite(input.diameter, 1, 300)
  if (front === null || rear === null || diameter === null) return null
  var ratio = (rear - front) / (2 * diameter)
  if (Math.abs(ratio) > 1) return null
  var side = Math.asin(ratio) * 180 / Math.PI
  return { side: side.toFixed(2), total: (2 * side).toFixed(2), delta: (rear - front).toFixed(2), relation: side > 0 ? '内八 / Toe-in' : side < 0 ? '外八 / Toe-out' : '平行' }
}
function corner(input) {
  var lf = finite(input.lf, 0, 100000), rf = finite(input.rf, 0, 100000), lr = finite(input.lr, 0, 100000), rr = finite(input.rr, 0, 100000)
  if ([lf, rf, lr, rr].some(function(v) { return v === null })) return null
  var total = lf + rf + lr + rr
  if (!(total > 0)) return null
  function percent(weight) { return (weight / total * 100).toFixed(1) + '%' }
  return { total: total.toFixed(1), front: percent(lf + rf), rear: percent(lr + rr),
    left: percent(lf + lr), right: percent(rf + rr), cross: percent(lf + rr), otherCross: percent(rf + lr) }
}
function camberGain(input) {
  var base = finite(input.base, -30, 30), compressed = finite(input.compressed, -30, 30), travel = finite(input.travel, 0.1, 100)
  if (base === null || compressed === null || travel === null) return null
  return { difference: (compressed - base).toFixed(2), rate: ((compressed - base) / travel).toFixed(3) }
}
function compare(a, b) {
  var fields = [
    ['轴距', 'dimensions', 'wheelbase', 'mm'], ['前轮距', 'dimensions', 'frontTrack', 'mm'], ['后轮距', 'dimensions', 'rearTrack', 'mm'],
    ['前单侧 Toe', 'dimensions', 'frontToe', '°'], ['后单侧 Toe', 'dimensions', 'rearToe', '°'],
    ['左 Camber', 'alignment', 'camberLeft', '°'], ['右 Camber', 'alignment', 'camberRight', '°'],
    ['左 Caster', 'alignment', 'casterLeft', '°'], ['右 Caster', 'alignment', 'casterRight', '°']
  ]
  return fields.map(function(f) {
    var av = finite(a[f[1]] && a[f[1]][f[2]], -1000, 1000), bv = finite(b[f[1]] && b[f[1]][f[2]], -1000, 1000)
    var delta = av === null || bv === null ? null : bv - av
    return { label: f[0], a: av === null ? '未记录' : String(av) + f[3], b: bv === null ? '未记录' : String(bv) + f[3],
      delta: delta === null ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(1) + f[3] }
  })
}
module.exports = { toe: toe, corner: corner, camberGain: camberGain, finite: finite, compare: compare }
return module.exports; })();
window.RdxReference = (function () { var module = { exports: {} };
// Visual estimate, NOT factory measurements or a reconstructed linkage model.
// See docs/rdx-akm-research.md for image coordinates and limitations.
// Only the full-lock endpoint is observed; the sweep is linear interpolation.
var endpoint = { inner: 73, outer: 77 }
// The separately filmed stock-alignment example reports 3° toe-out per side.
// It supplies a neutral reference only; the sweep remains illustrative interpolation.
var alignment = { frontCamber: -10, rearCamber: -3.5, frontToe: -3 }
function roundAngle(value) {
  return (value < 0 ? -1 : 1) * Math.round((Math.abs(value) + 1e-9) * 10) / 10 || 0
}
function sample(position, toe, track) {
  var p = Math.max(-100, Math.min(100, Number(position) || 0))
  var t = Math.abs(p) / 100
  var leftEnd = p < 0 ? endpoint.inner : -endpoint.outer
  var rightEnd = p < 0 ? endpoint.outer : -endpoint.inner
  var left = -alignment.frontToe * (1 - t) + leftEnd * t
  var right = alignment.frontToe * (1 - t) + rightEnd * t
  var offset = (Number(toe) || 0) - alignment.frontToe
  return {
    left: roundAngle(left - offset),
    right: roundAngle(right + offset),
    track: track,
    sourceText: 'RDX 图像估算 · 过程插值',
    target: false, showScale: false
  }
}
module.exports = { sample: sample, alignment: alignment }
return module.exports; })();
window.TabletCalibration = (function () { var module = { exports: {} };
// Approximate screen geometry, selected manually; never infer the model from screen size.
// Sources and model scope: docs/tablet-calibration.md.
var presets = [
  { id: 'ipad-a16', name: 'iPad 11″（A16）', shortPixels: 1640, longPixels: 2360, ppi: 264 },
  { id: 'ipad-9', name: 'iPad 10.2″（第 9 代）', shortPixels: 1620, longPixels: 2160, ppi: 264 },
  { id: 'ipad-air-m3', name: 'iPad Air 11″（M3）', shortPixels: 1640, longPixels: 2360, ppi: 264 },
  { id: 'galaxy-a11-plus', name: '三星 Tab A11+ 11″', shortPixels: 1200, longPixels: 1920, diagonalMm: 278.2 },
  { id: 'xiaomi-pad-7', name: '小米平板 7 11.2″', shortPixels: 2136, longPixels: 3200, ppi: 345 },
  { id: 'matepad-115-2025', name: '华为 MatePad 11.5（2025）', shortPixels: 1600, longPixels: 2456, ppi: 256 }
]
function estimate(id, window) {
  var preset = presets.filter(function(item) { return item.id === id })[0]
  var width = Number(window.screenWidth), height = Number(window.screenHeight)
  if (!preset || !isFinite(width) || !isFinite(height) || Math.min(width, height) < 600) return null
  var mmPerPixel = preset.ppi ? 25.4 / preset.ppi :
    preset.diagonalMm / Math.sqrt(preset.shortPixels * preset.shortPixels + preset.longPixels * preset.longPixels)
  var shortMm = preset.shortPixels * mmPerPixel, longMm = preset.longPixels * mmPerPixel
  var landscape = width > height
  // Convert the full screen's logical coordinates, never the canvas or app window's size.
  var x = Math.round(width / (landscape ? longMm : shortMm) * 50 * 2) / 2
  var y = Math.round(height / (landscape ? shortMm : longMm) * 50 * 2) / 2
  if (x < 80 || x > 600 || y < 80 || y > 600) return null
  return { x: x, y: y, name: preset.name }
}
module.exports = { presets: presets, estimate: estimate }
return module.exports; })();
