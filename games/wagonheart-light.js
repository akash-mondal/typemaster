/*
 * wagonheart-light.js - the light of every land at every hour.
 *
 * Each biome has eight keyframes around the clock:
 *   0 night  1 predawn  2 dawn  3 morning  4 noon  5 afternoon  6 dusk  7 twilight
 * and the game blends between them smoothly, and between biomes across a
 * transition zone, so neither the day nor the land ever cuts.
 *
 * A keyframe:
 *   sky:   [top, mid, low] gradient
 *   sun:   [disc, glow, glowSize, height 0..1 on its arc] (null when below the horizon)
 *   moon:  same shape as sun
 *   stars: 0..1 alpha
 *   far, mid, near: [tint, lift] - multiply tint for that depth, and an additive lift toward the sky colour (0..1)
 *   rim:   rim-light colour for sprites, with alpha
 *   fog:   [colour, density 0..1] at the horizon
 *   amb:   sprite brightness 0..1
 *   lamps: lantern and campfire glow 0..1
 *   fx:    ambient particles for this hour: 'fireflies' 'motes' 'mist' 'snowglint' 'shimmer' 'spray' 'aurora' 'rays' 'glints' 'none'
 */

const K = (sky, sun, moon, stars, far, mid, near, rim, fog, amb, lamps, fx) => ({ sky, sun, moon, stars, far, mid, near, rim, fog, amb, lamps, fx });

export const HOURS = ['night', 'predawn', 'dawn', 'morning', 'noon', 'afternoon', 'dusk', 'twilight'];

export const LIGHT = {
  // soft, hopeful: lavender and peach dawn, gold noon, long amber dusk, firefly night
  meadow: [
    K(['#070B1E', '#101A36', '#1A2A48'], null, ['#EEF2FF', 'rgba(170,190,255,0.35)', 26, 0.7], 1, ['#3A4870', 0.35], ['#2A3858', 0.2], ['#1C2840', 0.05], 'rgba(150,180,255,0.35)', ['#1A2848', 0.3], 0.42, 1, 'fireflies'),
    K(['#1A1C3E', '#3A3460', '#6A5478'], null, ['#E8ECFF', 'rgba(170,190,255,0.25)', 22, 0.25], 0.5, ['#6A6488', 0.35], ['#4A4868', 0.15], ['#343650', 0.05], 'rgba(200,180,240,0.3)', ['#7A6488', 0.35], 0.55, 0.7, 'mist'),
    K(['#4A5A9A', '#C890B0', '#F8C090'], ['#FFF0C8', 'rgba(255,200,140,0.55)', 40, 0.08], null, 0.1, ['#C8A0B8', 0.45], ['#9A8098', 0.2], ['#7A6A78', 0.05], 'rgba(255,190,140,0.55)', ['#F0B8A0', 0.35], 0.72, 0.2, 'mist'),
    K(['#5A9AE0', '#90C4F0', '#D8ECF0'], ['#FFFAE0', 'rgba(255,240,190,0.4)', 30, 0.4], null, 0, ['#A8C8E0', 0.4], ['#C8DCC8', 0.12], ['#FFFFFF', 0], 'rgba(255,240,200,0.25)', ['#D8ECF0', 0.2], 0.95, 0, 'rays'),
    K(['#3A88E8', '#78B8F0', '#C8E4F4'], ['#FFFFF0', 'rgba(255,250,220,0.35)', 26, 0.95], null, 0, ['#A0C4E8', 0.42], ['#D8E8D0', 0.1], ['#FFFFFF', 0], 'rgba(255,255,230,0.15)', ['#C8E4F4', 0.18], 1, 0, 'none'),
    K(['#4A8ADA', '#8CBCE8', '#E8E0C0'], ['#FFF0C0', 'rgba(255,220,150,0.4)', 30, 0.55], null, 0, ['#B0C0D8', 0.4], ['#E0D8B8', 0.12], ['#FFF4E0', 0], 'rgba(255,220,160,0.3)', ['#E8E0C0', 0.2], 0.95, 0, 'none'),
    K(['#3A4A8A', '#E0905A', '#FFC060'], ['#FFD890', 'rgba(255,160,70,0.6)', 48, 0.1], null, 0.05, ['#B8806A', 0.5], ['#A0705A', 0.22], ['#806050', 0.06], 'rgba(255,170,90,0.6)', ['#F0A060', 0.35], 0.75, 0.35, 'rays'),
    K(['#141A40', '#4A3868', '#A05A6A'], null, ['#F0F0FF', 'rgba(180,190,255,0.25)', 20, 0.15], 0.45, ['#5A4A70', 0.4], ['#3E3858', 0.18], ['#2A2A44', 0.05], 'rgba(200,150,200,0.35)', ['#6A4A6A', 0.35], 0.52, 0.85, 'fireflies'),
  ],
  // pearl mist, pink water, bright glinting noon, copper dusk, cool green night
  river: [
    K(['#06101A', '#0E2230', '#163440'], null, ['#E8F4FF', 'rgba(160,200,230,0.35)', 24, 0.65], 0.9, ['#2C4A58', 0.35], ['#1E3A44', 0.2], ['#142A30', 0.06], 'rgba(150,210,220,0.3)', ['#183A44', 0.35], 0.42, 1, 'glints'),
    K(['#1C2A40', '#4A5A70', '#8A9098'], null, ['#E8F0FF', 'rgba(170,200,230,0.2)', 20, 0.2], 0.4, ['#7A8898', 0.45], ['#5A6A78', 0.2], ['#3E4A54', 0.05], 'rgba(200,210,230,0.3)', ['#9AA4AC', 0.5], 0.56, 0.6, 'mist'),
    K(['#7A8AB0', '#E0B0B8', '#F8D8C0'], ['#FFF4DC', 'rgba(255,210,180,0.5)', 38, 0.08], null, 0.05, ['#D0B8C0', 0.5], ['#A898A0', 0.25], ['#88808A', 0.06], 'rgba(255,200,180,0.5)', ['#F0D0C8', 0.45], 0.74, 0.2, 'mist'),
    K(['#68A8E0', '#A0CCEC', '#E0F0F0'], ['#FFFFF0', 'rgba(255,250,220,0.35)', 28, 0.4], null, 0, ['#A8CCE0', 0.4], ['#C0DCD0', 0.12], ['#FFFFFF', 0], 'rgba(230,250,255,0.25)', ['#E0F0F0', 0.2], 0.96, 0, 'glints'),
    K(['#3C90E0', '#7CC0F0', '#D0ECF4'], ['#FFFFF4', 'rgba(255,255,235,0.35)', 26, 0.95], null, 0, ['#A0CCEA', 0.4], ['#C8E4D8', 0.1], ['#FFFFFF', 0], 'rgba(240,255,255,0.18)', ['#D0ECF4', 0.16], 1, 0, 'glints'),
    K(['#4A90D8', '#8CC0E4', '#E4E8D0'], ['#FFF4D0', 'rgba(255,230,170,0.4)', 30, 0.55], null, 0, ['#A8C0D4', 0.4], ['#D0D8C0', 0.12], ['#FFF8E8', 0], 'rgba(255,230,180,0.28)', ['#E4E8D0', 0.2], 0.95, 0, 'glints'),
    K(['#2E3E70', '#C07850', '#F0A058'], ['#FFD4A0', 'rgba(255,150,80,0.6)', 46, 0.1], null, 0.05, ['#A87A68', 0.5], ['#8A6A5A', 0.24], ['#6A5448', 0.06], 'rgba(255,160,100,0.55)', ['#D89070', 0.4], 0.74, 0.35, 'glints'),
    K(['#0C1830', '#1E3A50', '#4A6068'], null, ['#EEF6FF', 'rgba(170,210,230,0.25)', 20, 0.15], 0.4, ['#3A5460', 0.4], ['#2A4450', 0.2], ['#1C3038', 0.05], 'rgba(160,210,210,0.3)', ['#2E4A54', 0.4], 0.5, 0.85, 'mist'),
  ],
  // hard white-blue noon, ochre-violet dusk with long monolith shadows, black starfield night
  barrens: [
    K(['#02030A', '#060812', '#10121E'], null, ['#F4F4FF', 'rgba(210,220,255,0.3)', 22, 0.75], 1, ['#262838', 0.3], ['#1C1E2A', 0.15], ['#14141C', 0.04], 'rgba(200,210,255,0.35)', ['#10121E', 0.2], 0.4, 1, 'none'),
    K(['#10101E', '#2A2438', '#5A4450'], null, ['#EEEEFF', 'rgba(200,200,255,0.2)', 18, 0.25], 0.55, ['#4A4050', 0.3], ['#3A3240', 0.14], ['#2A2430', 0.04], 'rgba(220,180,200,0.3)', ['#5A4450', 0.3], 0.52, 0.6, 'none'),
    K(['#3A3A6A', '#B06A60', '#F0A870'], ['#FFE8C0', 'rgba(255,170,110,0.55)', 40, 0.08], null, 0.1, ['#B87A68', 0.45], ['#98685A', 0.22], ['#7A5448', 0.05], 'rgba(255,160,110,0.6)', ['#D0906A', 0.3], 0.72, 0.15, 'motes'),
    K(['#6A9ACE', '#B8CCD8', '#E8E0D0'], ['#FFFFF0', 'rgba(255,250,220,0.35)', 26, 0.4], null, 0, ['#B8C0C8', 0.45], ['#D0C8B8', 0.15], ['#FFF8F0', 0], 'rgba(255,245,220,0.3)', ['#E8E0D0', 0.25], 0.97, 0, 'motes'),
    K(['#4A88D8', '#A8CCEC', '#F0F4F4'], ['#FFFFFF', 'rgba(255,255,240,0.45)', 30, 0.95], null, 0, ['#C0D0E0', 0.5], ['#E8E4D8', 0.14], ['#FFFFFF', 0], 'rgba(255,255,255,0.2)', ['#F0F4F4', 0.3], 1.04, 0, 'shimmer'),
    K(['#5A8CD0', '#B0C4D4', '#EAD8B8'], ['#FFF4D0', 'rgba(255,230,170,0.4)', 30, 0.55], null, 0, ['#C0C0C0', 0.45], ['#E0CCA8', 0.15], ['#FFF0DC', 0], 'rgba(255,220,160,0.3)', ['#EAD8B8', 0.25], 0.96, 0, 'motes'),
    K(['#2A2458', '#A04A60', '#F08A48'], ['#FFC880', 'rgba(255,130,60,0.65)', 50, 0.1], null, 0.08, ['#8A5A70', 0.5], ['#A05A48', 0.26], ['#7A4638', 0.08], 'rgba(255,140,70,0.7)', ['#C87060', 0.35], 0.72, 0.3, 'motes'),
    K(['#080818', '#2A1C3A', '#6A3848'], null, ['#F4F0FF', 'rgba(210,200,255,0.25)', 20, 0.15], 0.6, ['#3A2C48', 0.35], ['#2C2236', 0.15], ['#1E1826', 0.04], 'rgba(220,160,200,0.35)', ['#4A2C40', 0.3], 0.5, 0.8, 'none'),
  ],
  // god-rays at morning, green-gold afternoon, early dusk under canopy, near-black lantern night
  highwood: [
    K(['#040A0C', '#081618', '#0E2020'], null, ['#E8F4F0', 'rgba(170,220,200,0.25)', 20, 0.6], 0.6, ['#1A302C', 0.25], ['#122420', 0.12], ['#0A1614', 0.03], 'rgba(160,220,190,0.25)', ['#0E2020', 0.35], 0.34, 1, 'fireflies'),
    K(['#142024', '#2A3C3C', '#4A5A54'], null, ['#E8F0F0', 'rgba(180,210,200,0.2)', 18, 0.2], 0.25, ['#4A5A54', 0.4], ['#34443E', 0.2], ['#22302C', 0.05], 'rgba(200,220,210,0.25)', ['#5A6A64', 0.55], 0.5, 0.7, 'mist'),
    K(['#4A6A80', '#A8A890', '#E0C898'], ['#FFF0C8', 'rgba(255,220,160,0.45)', 34, 0.1], null, 0.05, ['#90A090', 0.5], ['#6A7A64', 0.25], ['#4A5644', 0.06], 'rgba(255,220,160,0.45)', ['#C8C0A0', 0.5], 0.7, 0.3, 'rays'),
    K(['#5A98C8', '#98C4C8', '#D0E4C8'], ['#FFFAE0', 'rgba(255,240,190,0.4)', 28, 0.4], null, 0, ['#90B8B0', 0.4], ['#98B890', 0.12], ['#F0FFE8', 0], 'rgba(255,245,200,0.3)', ['#C8DCC0', 0.3], 0.9, 0, 'rays'),
    K(['#4A90D0', '#88C0D8', '#C8E4D0'], ['#FFFFF0', 'rgba(255,250,220,0.3)', 24, 0.95], null, 0, ['#90BCC0', 0.38], ['#A8CC98', 0.1], ['#FFFFFF', 0], 'rgba(255,255,230,0.15)', ['#C0E0C8', 0.22], 0.95, 0, 'rays'),
    K(['#5A8AB0', '#A0B890', '#E0D090'], ['#FFF0B0', 'rgba(255,220,130,0.45)', 30, 0.55], null, 0, ['#A0B090', 0.42], ['#B8B878', 0.14], ['#FFF4D0', 0], 'rgba(255,220,140,0.35)', ['#D8D098', 0.25], 0.88, 0, 'rays'),
    K(['#1E2E48', '#6A5A48', '#B08050'], ['#FFC880', 'rgba(255,150,70,0.5)', 40, 0.08], null, 0.05, ['#6A6050', 0.5], ['#4E4A38', 0.25], ['#34322A', 0.06], 'rgba(255,160,90,0.45)', ['#7A6A50', 0.45], 0.6, 0.6, 'none'),
    K(['#060E14', '#142420', '#2A3A30'], null, ['#EEF4F0', 'rgba(180,220,200,0.2)', 18, 0.15], 0.3, ['#223430', 0.35], ['#182824', 0.15], ['#0E1A18', 0.04], 'rgba(200,230,200,0.25)', ['#1E302A', 0.45], 0.4, 1, 'fireflies'),
  ],
  // blinding blue-white day, rose-gold alpenglow, moonlit glowing snow with aurora
  pass: [
    K(['#040818', '#0A1430', '#18284A'], null, ['#FFFFFF', 'rgba(200,220,255,0.45)', 28, 0.75], 1, ['#4A5E88', 0.5], ['#3A4E78', 0.3], ['#5A6E98', 0.25], 'rgba(170,200,255,0.5)', ['#2A3E68', 0.25], 0.55, 1, 'aurora'),
    K(['#141C3A', '#3A4470', '#7A7AA0'], null, ['#F4F8FF', 'rgba(200,210,255,0.3)', 22, 0.25], 0.5, ['#7A84B0', 0.45], ['#6A74A0', 0.25], ['#8A94C0', 0.2], 'rgba(210,200,255,0.4)', ['#8A8AB0', 0.35], 0.62, 0.6, 'snowglint'),
    K(['#5A6AB0', '#E0A8C8', '#FFD8D0'], ['#FFF4E8', 'rgba(255,200,200,0.55)', 40, 0.1], null, 0.1, ['#E0B8D0', 0.55], ['#C8A8C8', 0.3], ['#F0D8E0', 0.25], 'rgba(255,200,210,0.6)', ['#F8D0D8', 0.35], 0.85, 0.2, 'snowglint'),
    K(['#3A80E0', '#90C0F4', '#E8F4FF'], ['#FFFFFF', 'rgba(255,255,255,0.5)', 34, 0.45], null, 0, ['#B0D0F0', 0.5], ['#D0E4F8', 0.25], ['#FFFFFF', 0.1], 'rgba(255,255,255,0.4)', ['#E8F4FF', 0.3], 1.08, 0, 'snowglint'),
    K(['#2A70E0', '#80B8F4', '#F0F8FF'], ['#FFFFFF', 'rgba(255,255,255,0.55)', 36, 0.95], null, 0, ['#B8D8F8', 0.55], ['#E0ECFA', 0.28], ['#FFFFFF', 0.12], 'rgba(255,255,255,0.4)', ['#F0F8FF', 0.3], 1.12, 0, 'snowglint'),
    K(['#3A78D8', '#90BCEC', '#F4F0F0'], ['#FFF8E8', 'rgba(255,240,220,0.45)', 32, 0.55], null, 0, ['#B8CCE8', 0.5], ['#E0E4F0', 0.25], ['#FFFAF4', 0.1], 'rgba(255,240,220,0.35)', ['#F4F0F0', 0.3], 1.05, 0, 'snowglint'),
    K(['#3A3A80', '#E0808A', '#FFC098'], ['#FFD8B0', 'rgba(255,150,120,0.6)', 46, 0.1], null, 0.1, ['#D08898', 0.55], ['#E0A0A8', 0.32], ['#FFD0C8', 0.22], 'rgba(255,150,130,0.7)', ['#F0A0A0', 0.35], 0.85, 0.35, 'snowglint'),
    K(['#0C1030', '#2A2860', '#6A5A8A'], null, ['#FFFFFF', 'rgba(210,210,255,0.35)', 24, 0.2], 0.65, ['#4A4C80', 0.5], ['#3E4070', 0.3], ['#6A6C9A', 0.25], 'rgba(200,190,255,0.45)', ['#4A4878', 0.3], 0.6, 0.85, 'aurora'),
  ],
  // pastel mirage morning, bleached shimmering noon, one sheet of orange dusk, purple star-mirror night
  saltmere: [
    K(['#0A0620', '#1A1238', '#2A2050'], null, ['#FFFFFF', 'rgba(220,200,255,0.35)', 24, 0.7], 1, ['#3A3060', 0.20], ['#3A3468', 0.12], ['#4A4478', 0.09], 'rgba(210,190,255,0.4)', ['#2A2050', 0.11], 0.5, 1, 'none'),
    K(['#2A2048', '#6A5478', '#B090A8'], null, ['#F8F4FF', 'rgba(220,200,255,0.25)', 20, 0.25], 0.5, ['#8A7898', 0.23], ['#A090B0', 0.14], ['#B8A8C8', 0.10], 'rgba(230,200,240,0.35)', ['#B090A8', 0.17], 0.66, 0.6, 'none'),
    K(['#A0A8D8', '#F8C8D8', '#FFF0E0'], ['#FFFAF0', 'rgba(255,220,220,0.45)', 38, 0.08], null, 0.05, ['#F0D0DC', 0.30], ['#F8E0E4', 0.17], ['#FFF0F0', 0.11], 'rgba(255,210,220,0.5)', ['#FFE8E8', 0.19], 0.92, 0.2, 'mist'),
    K(['#8AB8F0', '#D0E4F8', '#FFFFFF'], ['#FFFFFF', 'rgba(255,255,250,0.45)', 32, 0.4], null, 0, ['#E0ECF8', 0.28], ['#F4F8FC', 0.16], ['#FFFFFF', 0.10], 'rgba(255,255,255,0.3)', ['#FFFFFF', 0.19], 1.1, 0, 'shimmer'),
    K(['#78B0F0', '#D8ECFC', '#FFFFFF'], ['#FFFFFF', 'rgba(255,255,255,0.6)', 40, 0.95], null, 0, ['#E8F0FA', 0.30], ['#FFFFFF', 0.17], ['#FFFFFF', 0.11], 'rgba(255,255,255,0.3)', ['#FFFFFF', 0.22], 1.18, 0, 'shimmer'),
    K(['#80B0E8', '#E0E8F4', '#FFF8F0'], ['#FFFAF0', 'rgba(255,245,230,0.5)', 36, 0.55], null, 0, ['#E8ECF4', 0.28], ['#FFF8F4', 0.16], ['#FFFCF8', 0.10], 'rgba(255,245,230,0.3)', ['#FFF8F0', 0.19], 1.12, 0, 'shimmer'),
    K(['#6A3A60', '#F07840', '#FFB050'], ['#FFD890', 'rgba(255,130,50,0.7)', 56, 0.1], null, 0.05, ['#F09060', 0.30], ['#FFA060', 0.17], ['#FFB878', 0.10], 'rgba(255,140,60,0.7)', ['#FFA060', 0.22], 0.95, 0.3, 'none'),
    K(['#140C30', '#3A2058', '#7A3A70'], null, ['#FFFFFF', 'rgba(220,190,255,0.3)', 22, 0.15], 0.7, ['#4A3068', 0.23], ['#5A3A78', 0.13], ['#6A4A88', 0.09], 'rgba(220,170,240,0.4)', ['#4A2A60', 0.17], 0.56, 0.8, 'none'),
  ],
  // silver sea morning, turquoise noon, red sun into the sea, lighthouse night with glowing waves
  coast: [
    K(['#040A1A', '#0A1830', '#122840'], null, ['#F0F8FF', 'rgba(170,210,255,0.35)', 24, 0.7], 0.9, ['#223A58', 0.35], ['#1A3048', 0.18], ['#122236', 0.05], 'rgba(160,210,240,0.35)', ['#142A40', 0.3], 0.42, 1, 'spray'),
    K(['#1A2440', '#44587A', '#8A98A8'], null, ['#EEF4FF', 'rgba(180,210,240,0.25)', 20, 0.25], 0.4, ['#6A7A90', 0.45], ['#4E5E74', 0.2], ['#364454', 0.05], 'rgba(200,215,240,0.3)', ['#8A98A8', 0.45], 0.56, 0.6, 'mist'),
    K(['#8A9AB8', '#D8C8D0', '#F4E8E0'], ['#FFF8F0', 'rgba(255,230,220,0.45)', 36, 0.08], null, 0.05, ['#C8C0C8', 0.5], ['#A8A0A8', 0.22], ['#888088', 0.06], 'rgba(255,225,215,0.45)', ['#E8E0E0', 0.45], 0.8, 0.2, 'mist'),
    K(['#5AA0E0', '#9CCCF0', '#E0F4F8'], ['#FFFFF4', 'rgba(255,255,230,0.4)', 28, 0.4], null, 0, ['#9CC8E4', 0.4], ['#B8DCD4', 0.12], ['#FFFFFF', 0], 'rgba(240,255,255,0.28)', ['#E0F4F8', 0.2], 0.97, 0, 'spray'),
    K(['#2A98E8', '#6CD0F0', '#C8F4F4'], ['#FFFFF4', 'rgba(255,255,240,0.35)', 26, 0.95], null, 0, ['#8CD0E8', 0.42], ['#B0E4D8', 0.1], ['#FFFFFF', 0], 'rgba(240,255,255,0.18)', ['#C8F4F4', 0.16], 1, 0, 'spray'),
    K(['#3A90D8', '#80C4E8', '#E8ECD8'], ['#FFF4D8', 'rgba(255,235,180,0.4)', 30, 0.55], null, 0, ['#9CC4DC', 0.42], ['#C8D8C0', 0.12], ['#FFF8EC', 0], 'rgba(255,235,190,0.3)', ['#E8ECD8', 0.2], 0.95, 0, 'spray'),
    K(['#2A2A60', '#D0504A', '#FF9A48'], ['#FFB070', 'rgba(255,90,50,0.7)', 58, 0.06], null, 0.08, ['#A0506A', 0.55], ['#904A50', 0.28], ['#6A3A40', 0.08], 'rgba(255,110,70,0.7)', ['#E06850', 0.4], 0.72, 0.45, 'spray'),
    K(['#08102A', '#1E2A50', '#4A4A6A'], null, ['#F4F8FF', 'rgba(180,200,255,0.3)', 22, 0.15], 0.45, ['#2E3A60', 0.4], ['#222E4C', 0.2], ['#161E34', 0.05], 'rgba(170,200,240,0.35)', ['#26304C', 0.35], 0.48, 1, 'spray'),
  ],
};

// ---------------------------------------------------------------- blending
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, u) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * u)); };
const parseRgba = s => { const m = /rgba?\(([^)]+)\)/.exec(s); const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; };
const mixRgba = (a, b, u) => { const A = parseRgba(a), B = parseRgba(b); const c = A.map((v, i) => v + (B[i] - v) * u); return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + c[3].toFixed(3) + ')'; };
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = u => u * u * (3 - 2 * u);
function mixBody(a, b, u) {
  if (!a && !b) return null;
  // a body rising or setting fades its glow rather than popping
  if (!a) return [b[0], b[1], b[2], b[3], u];
  if (!b) return [a[0], a[1], a[2], a[3], 1 - u];
  return [mixHex(a[0], b[0], u), mixRgba(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u), 1];
}
function mixKey(a, b, u) {
  return {
    sky: a.sky.map((c, i) => mixHex(c, b.sky[i], u)),
    sun: mixBody(a.sun, b.sun, u),
    moon: mixBody(a.moon, b.moon, u),
    stars: lerp(a.stars, b.stars, u),
    far: [mixHex(a.far[0], b.far[0], u), lerp(a.far[1], b.far[1], u)],
    mid: [mixHex(a.mid[0], b.mid[0], u), lerp(a.mid[1], b.mid[1], u)],
    near: [mixHex(a.near[0], b.near[0], u), lerp(a.near[1], b.near[1], u)],
    rim: mixRgba(a.rim, b.rim, u),
    fog: [mixHex(a.fog[0], b.fog[0], u), lerp(a.fog[1], b.fog[1], u)],
    amb: lerp(a.amb, b.amb, u),
    lamps: lerp(a.lamps, b.lamps, u),
    fx: u < 0.5 ? a.fx : b.fx,
    fxA: a.fx === b.fx ? 1 : Math.abs(u - 0.5) * 2,
  };
}

// the light of `biome` at `hour` (0..8, wrapping; 0 = midnight keyframe)
export function lightAt(biome, hour) {
  const table = LIGHT[biome] || LIGHT.meadow;
  const h = isFinite(hour) ? ((hour % 8) + 8) % 8 : 3;
  const i = Math.floor(h), u = smooth(h - i);
  return mixKey(table[i], table[(i + 1) % 8], u);
}
// the light between two biomes during a transition (t 0 = old, 1 = new)
export function lightBetween(fromBiome, toBiome, hour, t) {
  if (!toBiome || fromBiome === toBiome || t <= 0) return lightAt(fromBiome, hour);
  if (t >= 1) return lightAt(toBiome, hour);
  return mixKey(lightAt(fromBiome, hour), lightAt(toBiome, hour), smooth(t));
}

export default { LIGHT, HOURS, lightAt, lightBetween };
