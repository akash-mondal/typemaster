import bpy, math, json
# NOTE: never dedup meshes on this model — the keycap legends live in the UVs,
# so merging by vertex position alone silently collapses different letters.
from mathutils import Vector

def bb(o):
    pts=[o.matrix_world @ Vector(c) for c in o.bound_box]
    mn=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)))
    mx=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
    return mn,mx

def set_origin(o, pt):
    bpy.context.view_layer.objects.active=o
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.context.scene.cursor.location = pt
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.select_set(False)

# ---- strip the studio: cameras + backdrop planes are not part of the machine
for n in ['Camera','Camera.001','Plane','Plane.001']:
    o=bpy.data.objects.get(n)
    if o: bpy.data.objects.remove(o, do_unlink=True)

kids=lambda n: [c for c in bpy.data.objects[n].children if c.type=='MESH']

# ── key levers ─────────────────────────────────────────────────────────────
# rows read off the baked legend atlas (Keys Layout-01.png), left to right
ROWS = [
 ['Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus'],
 ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','Fraction','Backspace'],
 ['ShiftLock','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','AtCent','MarginRelease'],
 ['ShiftLeft','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash','ShiftRight'],
]
NONTYPING = {'ShiftLock','Backspace','MarginRelease','ShiftLeft','ShiftRight'}

keys=kids('Blank Key')
info=[]
for o in keys:
    mn,mx=bb(o); info.append((o,mn,mx,(mn+mx)/2))
# the one wide flat part in this group is the key mounting plate, not a key
plate=max(info, key=lambda t:(t[2].x-t[1].x)*(t[2].y-t[1].y))
plate[0].name='KEYPLATE'
info=[t for t in info if t[0] is not plate[0]]

# bucket by cap y (front end of the lever); 4 clear bands
info.sort(key=lambda t:-t[3].y)
bands=[]
for t in info:
    if bands and abs(bands[-1][0][3].y - t[3].y) < 0.30: bands[-1].append(t)
    else: bands.append([t])
assert len(bands)==4, [len(b) for b in bands]
mapping={}
for row, band in zip(ROWS, bands):
    band.sort(key=lambda t:t[3].x)
    assert len(band)==len(row), (len(band), len(row), row)
    for code,(o,mn,mx,c) in zip(row, band):
        o.name = 'KEY_'+code
        # hinge lives at the BACK of the lever; the cap is the front end
        set_origin(o, Vector((c.x, mx.y, mx.z)))
        mapping[code]={'cap':[round(c.x,4), round(mn.y,4), round(mx.z,4)]}

# ── type bars ──────────────────────────────────────────────────────────────
bars=[]
for o in kids('Hammer'):
    mn,mx=bb(o); bars.append((o,mn,mx,(mn+mx)/2))
bars.sort(key=lambda t:t[3].x)
for i,(o,mn,mx,c) in enumerate(bars):
    o.name = 'BAR_%02d'%i
    # bars swing up from the bottom-front of the basket
    set_origin(o, Vector((c.x, mx.y, mn.z)))

# typing keys get a bar each, paired left-to-right so the basket fans naturally
typing=[(c,d) for c,d in mapping.items() if c not in NONTYPING]
typing.sort(key=lambda kv: kv[1]['cap'][0])
assert len(typing)==len(bars), (len(typing), len(bars))
for i,(code,_) in enumerate(typing): mapping[code]['bar']='BAR_%02d'%i

# ── the rest of the machine ────────────────────────────────────────────────
RENAME={'Body (1)':'BODY'}
for src,dst in [('Platen','PLATEN'),('Platen Back','PLATEN_BACK'),('Platten Plate','PLATEN_PLATE'),
                ('Paper Tensioner','PAPER_TENSIONER'),('Space Bar','SPACEBAR'),('Lever','LEVER'),
                ('Measuring Tape','TAPE'),('Hammer Block','HAMMER_BLOCK')]:
    for i,c in enumerate(kids(src)): RENAME[c.name]=f'{dst}_{i}'
for a,b in RENAME.items():
    o=bpy.data.objects.get(a)
    if o: o.name=b

# spacebar pivots at its back edge like the keys
for o in [x for x in bpy.data.objects if x.name.startswith('SPACEBAR')]:
    mn,mx=bb(o); set_origin(o, Vector(((mn.x+mx.x)/2, mx.y, mx.z)))
# the return lever pivots where it meets the carriage
for o in [x for x in bpy.data.objects if x.name.startswith('LEVER')]:
    mn,mx=bb(o); set_origin(o, Vector((mx.x, mn.y, (mn.z+mx.z)/2)))

# carriage parts ride together
carr=bpy.data.objects.new('CARRIAGE', None)
bpy.context.scene.collection.objects.link(carr)
for o in list(bpy.data.objects):
    if any(o.name.startswith(p) for p in ('PLATEN','PAPER_TENSIONER','TAPE','LEVER')):
        m=o.matrix_world.copy(); o.parent=carr; o.matrix_world=m

json.dump(mapping, open('/tmp/tw_map.json','w'), indent=1)
print("KEYS", len(mapping), "BARS", len(bars))
bpy.ops.wm.save_as_mainfile(filepath='/tmp/tw_prepped.blend')
print("saved prepped blend")
