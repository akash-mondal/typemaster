/*
 * nova-words.js - NOVA's word bank, by length.
 *
 * Common English plus a little space. Plain lower-case letters only, so a word
 * can always be typed on any layout without shift or punctuation.
 */

const RAW = {
  2: 'am an as at be by do go he if in is it me my no of oh ok on or ox so to up us we',
  3: `ace act add age ago aid aim air all and ant any apt arc arm art ash ask ate axe bad bag
    ban bar bat bay bed bee big bin bit bow box boy bud bug bus but buy cab can cap car cat cop
    cow cry cub cup cut dad day den dew did die dig dim dip dog dot dry due dug dye ear eat egg
    ego elf elm end era eve eye fan far fat fax fed fee few fig fin fir fit fix fly foe fog for
    fox fry fun fur gap gas gel gem get gin god got gum gun gut guy gym ham hat hay hen her hid
    him hip his hit hop hot how hub hue hug hum hut ice icy ill ink inn ion ivy jab jam jar jaw
    jet job jog joy jug keg key kid kin kit lab lad lap law lay led leg let lid lie lip lit log
    lot low mad map mat max may men met mix mob mop mud mug nap net new nod nor not now nut oak
    oar oat odd off oil old one orb ore our out owl own pad pal pan paw pay pea pen pet pie pig
    pin pit pod pop pot pro pub pun pup put ram ran rat raw ray red rib rid rig rim rip rob rod
    rot row rub rug run rye sad sag sat saw say sea see set sew shy sip sir sit six ski sky sly
    sob sod son sow soy spa spy sub sum sun tab tag tan tap tar tax tea ten the tie tin tip toe
    ton too top tow toy try tub tug two urn use van vat vet via vow wag war was wax way web wet
    who why wig win wit won woo wow yak yam yes yet you zap zen zip zoo`,
  4: `able acid aged also alto amid area army atom aunt away axis baby back bake ball band bank
    barn base bath beam bean bear beat beef bell belt bend best bike bird bite blue boat body bolt
    bomb bond bone book boom boot born boss both bowl bulb bull burn bush busy cafe cage cake calm
    camp card care cart case cash cast cave cell chat chef chip city clap claw clay clip club coal
    coat code coin cold comb come cone cook cool cope copy cord core corn cost crew crop crow cube
    curl dare dark dash data dawn deal dear debt deck deep deer desk dial dice diet dirt dish dive
    dock does doll dome done door dose dove down drag draw drip drop drum duck dull dune dust duty
    each earn ease east easy echo edge else epic even ever exit face fact fade fail fair fake fall
    fame farm fast fate fear feed feel fern file fill film find fine fire firm fish five flag flap
    flat fled flip flow foam fold folk food foot fork form fort four free frog from fuel full fund
    fuse gain gale game gate gave gaze gear gift girl give glad glow glue goal goat gold golf gone
    good grab gray grew grid grin grip grow gulf gust hail hair half hall halo hand hang hard harm
    harp hawk head heal heap hear heat held helm help herb here hero hide high hike hill hint hive
    hold hole home hood hook hope horn host hour huge hull hunt hurt idea idle inch into iron item
    jazz join joke jump jury just keen keep kept kick kind king kite knee knot know lace lady lake
    lamp land lane last late lava lawn lead leaf lean leap left lens less life lift like lime line
    link lion list live load loan lock loft long look loop lord lose loud love luck lung made mail
    main make mall many mark mars mask mast math maze meal mean meat meet melt menu mesh mild milk
    mill mind mine mint miss mist moat mode mole mood moon more moss most moth move much mule myth
    nail name navy near neat neck need nest news next nice nine node none noon norm nose note nova
    oath obey odds once only open oven over pace pack page paid pain pair palm park part pass past
    path peak pear peel pick pier pile pine pink pipe plan play plot plug plum poem poet pole pond
    pony pool poor port pose post pour pray prey pull pulp pump pure push quiz race raft rage rail
    rain rank rare rate read real reef rent rest rice rich ride ring rise risk road roar rock rode
    role roll roof room root rope rose ruby rule rush rust safe sage said sail salt same sand save
    scan seal seat seed seek seem self sell send ship shoe shop shot show shut side sign silk sing
    sink site size skip slab slam sled slim slip slot slow snap snow soap sock soft soil sold sole
    solo song soon sort soul soup spin spot star stay stem step stew stir stop such suit sure swan
    swap sway swim tail take tale talk tall tank tape task team tear tell tent term test text than
    that them then they thin this tide tidy tile time tiny tire toad told tone tool tour town trap
    tray tree trim trip true tube tuna tune turn twin type unit upon used user vast verb very vest
    view vine void vote wade wage wait wake walk wall wand want warm warn wash wave weak wear week
    well went west what when whip wide wife wild will wind wing wire wise wish with wolf wood wool
    word wore work worm yard yarn year yell zero zone`,
  5: `about above actor adapt admit adopt adult after again agent agree ahead alarm album alert alien
    alike alive alley allow alone along alpha alter amber amuse angel anger angle angry ankle apple
    apply apron arena argue arise armor arrow aside asset atlas audio avoid awake award aware awful
    bacon badge baker basic basin batch beach beard beast begin being belly bench berry birth black
    blade blame blank blast blaze blend bless blind blink block bloom blown board boost booth bound
    brain brake brand brass brave bread break brick bride brief bring broad brook brown brush build
    built bunch burst cabin cable camel canal candy canoe cargo carry catch cause cedar chain chair
    chalk charm chart chase cheap check cheek cheer chess chest chief child chill choir chord civic
    claim class clean clear clerk click cliff climb clock close cloth cloud clown coach coast comet
    coral couch count court cover crack craft crane crash crawl cream creek crest crisp cross crowd
    crown crust cycle daily dance dealt death decay decoy delay delta dense depth diary digit diner
    dizzy dodge doubt dough draft drain drama drawn dream dress dried drift drill drink drive drone
    eager eagle early earth easel eaten eight elbow elder elite empty enemy enjoy enter entry equal
    error event every exact exile exist extra fable faint faith false fancy fault feast fence ferry
    fetch fever fiber field fifty fight final flame flash fleet flesh float flock flood floor flour
    fluid flush flute focus force forge forth forum found frame fresh front frost fruit fudge fully
    gamma giant glass gleam glide globe gloom glory glove going grace grade grain grand grant grape
    graph grasp grass grave great green greet grief grill grind groan group grove guard guess guest
    guide habit happy harsh haste haven heart heavy hedge hello hinge hobby honey honor horse hotel
    house hover human humor hurry ideal image index inner input irony ivory jelly jewel joint judge
    juice jumbo karma kayak knife knock label labor laser latch later laugh layer learn lemon level
    lever light limit linen liver local lodge logic loose lucky lunar lunch magic major maker mango
    manor maple march match mayor meant medal merit metal meter might minor mixed model money month
    moral motor mount mouse mouth movie music naval nerve never night noble noise north novel nurse
    ocean offer often olive onion orbit order organ other outer owner oxide paint panel panic paper
    party pasta patch pause peace peach pearl pedal phase phone photo piano piece pilot pitch pixel
    pizza place plain plane plant plate plaza point polar pound power press price pride prime print
    prism prize probe proof proud pulse punch pupil queen quest quick quiet quilt quota radar radio
    rally ranch range rapid ratio raven reach react ready realm rebel refer relax relay reply rider
    ridge rifle right rigid river roast robin robot rocky rough round route royal rugby ruler rumor
    rural salad sauce scale scarf scene scent scope score scout scrap sense serve seven shade shake
    shape share shark sharp sheep shelf shell shift shine shiny shirt shock shore short shout sight
    sigma silly since skate skill skirt skull slate sleep slice slide slope smart smile smoke snack
    snake solar solid solve sonic sound south space spade spare spark speak speed spell spend spice
    spike spine spoon sport spray squad stack staff stage stair stamp stand start state steam steel
    steep stern stick still stone stood storm story stove strap straw strip study style sugar sunny
    super surge sweet swift swing sword table taste teach teeth tempo thank theme thick thief thing
    think third thorn three throw thumb tiger tight timer title toast today token topic torch total
    touch tough tower toxic track trade trail train trait trend trial tribe trick truck truly trust
    truth tulip twist ultra uncle under union unity until upper upset urban usage usual valid value
    valve vapor vault verse video vigor vinyl viral virus visit vital vivid vocal voice voter wagon
    waste watch water whale wheat wheel where while white whole width witch woman world worry worth
    woven wrist write yacht young youth zebra`,
  6: `absorb accent accept access across action active actual adjust admire advice aerial affair
    afford agenda almond always amount anchor animal annual answer anthem anyway appeal appear arcade
    archer arctic around arrest arrive artist aspect assign assist asteer attach attack attend autumn
    avenue backup badger ballet bamboo banana banner barrel basket battle beacon beauty become before
    behave behind belong beside better beyond bishop bitter blanket blazer blower bomber bonnet border
    borrow bottle bottom bounce branch breach breath breeze bridge bright broken bronze bubble bucket
    budget buffer bullet bundle burden bureau butter button cactus camera campus candle canvas canyon
    carbon career carpet carrot castle casual cattle caught celery cellar cement center cereal chance
    change chapel charge cherry choice choose chorus cinema circle circus clever client clinic closet
    clutch cobalt coffee collar colony column combat comedy commit common convoy cookie copper corner
    cosmic cotton county couple course cousin cradle crater crayon credit crisis crunch cruise cursor
    custom cypher damage dancer danger debate decade decent decide defeat defend degree demand desert
    design detail device dialog diesel dinner direct divide doctor dollar domain donkey double dragon
    drawer driver during easily eating effect effort eighty either eleven elixir embark emerge empire
    enable endure energy engine enough ensure entire escape estate evolve exceed except excite expand
    expect expert export extend fabric factor fairly falcon family famous farmer fasten father faucet
    fellow female figure filter finger finish fiscal flavor flight flower flying follow forest forget
    formal format fossil fourth freeze friend frozen future galaxy garage garden garlic gather gentle
    ginger glance global golden gospel govern ground growth guitar hammer handle happen harbor hazard
    health heater helmet hermit hidden hollow honest horror hunger hunter hybrid ignite impact import
    income indeed inform injury insect inside insist intent invent invite island jacket jaguar jersey
    jungle junior kernel kettle kidney kitten ladder launch lawyer leader legend lemony lesson letter
    lights liquid little lively lizard locate locker lounge luxury magnet mammal manage manner marble
    margin marine market master matter meadow medium member memory mental mentor merger meteor method
    middle mighty minute mirror mobile modern moment monkey mosaic mostly mother motion museum mutual
    muzzle myself napkin narrow nation native nature nearby nebula needle nephew nickel nimble nobody
    normal notice number object obtain office online option orange orient origin output oxygen oyster
    packet paddle palace parade parcel parent pastel patrol pencil people pepper period permit person
    phrase picnic pigeon pillow planet plasma player please pledge pocket poetry police policy polish
    portal potato powder praise prefer pretty prince prison profit prompt proper public puzzle quartz
    rabbit racing radius random rather reason recipe record reduce reform region relief remedy remote
    repair repeat report rescue resist result retire return reveal review reward rhythm ribbon riddle
    rocket rotate runway saddle safety salmon sample saturn scheme school screen script search season
    second secret sector select senior series settle shadow shield signal silent silver simple single
    sister sketch slogan smooth socket source spider spirit splash sponge spread spring sprint square
    stable static status steady stereo sticky strike string stroke strong studio submit subtle suburb
    sudden summer summit sunset supply switch symbol system tackle talent target temple tender tennis
    thirty thread threat throne thrust ticket timber tissue toggle tomato tongue toward travel treaty
    tricky trophy tunnel turtle twelve unfold unique unlock update upward useful valley vanish vector
    velvet vendor verify vessel viewer violet virtue vision volume voyage walnut wander warmth warner
    weapon weekly weight window winner winter wisdom wizard wonder wooden worker yellow zenith zipper`,
  7: `ability absence academy account achieve acquire address advance adverse airline alchemy already
    amazing ancient antenna anxiety anybody arrange article assault athlete attempt attract auction
    average awesome balance balloon bandage banquet baptism bargain barrier battery bedroom believe
    benefit between bicycle billion biscuit blanket blossom booster bracket brother builder burning
    cabinet caliber capable capital captain capture careful cartoon caution ceiling central century
    certain chamber channel chapter charity charter checker chicken circuit citizen clarity classic
    climate clothes cluster coastal cockpit collect college combine comfort command comment company
    compass complex concept concert conduct confirm connect console contact contain content contest
    context control convert correct costume council counter country courage cousins crafted creator
    crystal culture current curtain customs cutlery cyclone daytime deficit defense deliver density
    deposit desktop despite destroy develop diamond digital dinosaur discard display distant dolphin
    drawing dynamic eclipse economy edition elegant element embrace emotion empower enchant endless
    engaged enhance episode equator erosion evening examine example excited execute exhibit expense
    explain explore express extreme factory faculty fashion fantasy fatigue feature federal feeling
    fiction fifteen fighter finance firefly fishing fitness flicker forever formula fortune forward
    freedom freight fulfill funeral furnace gallery gateway general genuine gesture giraffe glacier
    glimpse gravity grocery guardian habitat halfway harmony harvest heading healthy hearing heavens
    heroine highway history holiday horizon housing however hundred husband illegal imagine impulse
    include initial insight inspire install instant interim invader journey justice keyboard kingdom
    kitchen landing lantern largely laundry lecture leisure liberty library license lighter limited
    machine magical manager mansion massive maximum meaning measure medical meeting mention message
    midnight militia mineral minimum miracle mission mistake mixture monarch monitor monster morning
    mustard mystery natural neither network neutron nothing nuclear nucleus observe obvious octopus
    offense officer opinion optical orbital organic orchard outcome outlook outpost overall pacific
    package painter panther parking partner passage passion patient pattern payment penalty pending
    penguin pension percent perfect perhaps phantom picture pilgrim pioneer plastic plateau pleased
    podcast polygon popular portion poverty precise predict premium prepare present prevent primary
    printer privacy private problem proceed process produce product profile program project promise
    protect protein provide publish pulsars pumpkin pyramid quality quantum quarter quickly radiant
    railway rainbow reactor reality receive recover reflect regular related release remains removal
    replace request reserve resolve respect restore retreat revenue reverse roaming rooftop routine
    satisfy scatter scholar science scratch section segment serious service session setting several
    shelter sheriff shimmer shuttle silence similar sincere skyline slender soldier someone speaker
    special species sponsor stadium station stellar storage strange stretch student subject success
    suggest summary support supreme surface surgeon survive suspect sustain symptom teacher texture
    theater therapy thought through thunder tonight tornado torpedo tourist towards tractor traffic
    trailer trainer transit trigger trouble trumpet tsunami typhoon uniform unknown upgrade uranium
    utility vaccine variety vehicle venture version veteran victory village vintage virtual visible
    volcano voltage waiting walking warrior weather website wedding weekend welcome western whisper
    willing without witness working worried writing`,
  8: `absolute abstract academic accurate activate actually addition adequate advanced aircraft
    alliance although ambition analysis ancestor animated anything anywhere apparent approach approval
    argument arrogant artifact asteroid assembly audience autonomy backbone backward balanced bathroom
    becoming birthday blizzard boundary breaking brightly brochure building business calendar campaign
    capacity cardinal carnival category ceremony champion chemical children chipmunk circular civilian
    climbing clothing collapse colorful combined commerce complete composer computer concrete conflict
    confused constant consumer continue contract contrast convince cosmetic coverage creative criminal
    critical crossing cultural customer cylinder daughter deadline decision decrease definite delivery
    designer detector diagonal dialogue dinosaur director disaster discount discover disorder distance
    distinct district dividend doctrine document domestic dominant download dramatic duration dynamics
    earnings economic educated election electric elephant elevator emerging emission employee endpoint
    engineer enormous entrance envelope equation equipped estimate evaluate evidence exchange exciting
    exercise existing explicit exposure external familiar fanatics fastener feedback festival fighting
    figurine finished firewall flagship flexible floating football forecast forensic formerly fortress
    fraction frequent friendly frontier function generate generous gigantic graceful graphics grateful
    guidance handsome hardware headline heritage highland homework hospital humanity hydrogen identify
    identity ignition illusion imperial incident increase indicate industry infinite informal innocent
    innovate instance integral intended interest interior internal interval invasion investor isolated
    judgment keyboard kindness landmark language latitude launcher leadership learning left over
    lifetime lighting likewise literacy location magnetic maintain majority managing marathon material
    maximize mechanic medicine memorial merchant midnight military minister minority mobility moderate
    molecule momentum monument mountain movement multiple mushroom national navigate negative neighbor
    nightfall normally notebook numerous observer obstacle occasion offering official operator opponent
    opposite optimism ordinary organism original outbreak overcome overview painting parallel particle
    passport password patience peaceful pentagon periodic personal persuade petition physical pinnacle
    planning platform pleasant politics portrait position positive possible powerful practice precious
    pregnant presence pressure previous princess priority probable producer progress prolific property
    proposal prospect protocol provider province purchase question quotient railroad reaction receiver
    recovery referral regional relative relevant reliable religion remember reminder repeated research
    resident resource response restless revision rotation sanction saturday scenario schedule scrutiny
    sculptor seasonal security sentence separate sequence services shipment shoulder sidewalk simulate
    skeleton snapshot software soldiers solution somebody southern specific spectrum splendid sprinkle
    squadron standard starship stealthy stimulus straight strategy strength stubborn students suburban
    suitable sunlight superior supplier surprise survival sweeping symmetry sympathy tactical takeover
    teaching teammate teenager telegram template terminal terrible thinking thousand together tomorrow
    tracking transfer traverse treasure triangle tropical ultimate umbrella universe unlikely upstream
    vacation validity valuable variable velocity vertical violence visitors vocalist warships
    weakness wildlife wireless withdraw woodland workshop yearbook yourself`,
  9: `abilities abundance accessory accompany according achieved adventure advertise aerospace affection
    afternoon agreement algorithm alignment allowance alternate ambitious amplifier animation apartment
    apparatus architect assistant astronaut atmosphere attention attractive authority automatic available
    awareness backfield bandwidth barricade beautiful beginning behaviour biography blueprint boomerang
    breakfast brilliant broadband butterfly calculate calibrate candidate carefully celebrate challenge
    character chemistry chocolate christmas classical climbing collector colleague commander committee
    community companion component composite conductor confident confusion connected conscious construct
    container continent corporate counselor crocodile curiosity dangerous dashboard deadlines debugging
    decorated dedicated defensive delicious departure dependent depressed desperate detection determine
    developer different difficult dimension direction disappear discovery dominance dramatic education
    effective efficient elaborate electrode elevation emergency emotional encounter encourage endurance
    energetic engineers enjoyment entertain equipment essential establish everybody evolution excellent
    execution exclusive existence expansion expensive expertise explosion extension fantastic fireworks
    fisherman following forgotten formation framework frequency frightens furniture gathering generator
    gentleman geography gladiator greenhouse guarantee guideline happiness harmonica headlight highlight
    hurricane hyperlink ignorance imaginary immediate important impressed incentive including indicator
    influence inherited injection innocence inspector insurance integrity intensity interface interview
    introduce inventory invisible iteration labyrinth landscape lightning limestone literally lunchtime
    machinery magnitude marketing marvelous masterful meanwhile mechanism messenger meteorite microwave
    migration milestone millennium miniature mysterious narrative necessary negotiate newspaper nightmare
    nostalgia numerical objective obstacles occupancy offspring operation organized orchestra otherwise
    outskirts overnight parachute paragraph paralysis parameter passenger pendulum perimeter permanent
    personnel pineapple placement plaintiff pollution porcelain potential practical precision president
    procedure professor prototype publisher pyramidal qualified quarterly radiation recognize recommend
    reference reflector refrigerate regularly rehearsal relevance religious remainder reporting represent
    reservoir resilient resonance restaurant revolving satellite scientist sculpture secretary selection
    semicolon sensation sentiment signature situation skyscraper something sometimes spaceship spaceport
    spearhead spectator spotlight staircase starlight stimulate strategic structure submarine substance
    succeeded sufficient sunflower supernova surrender swordfish technical telescope temporary territory
    therefore threshold thumbnail tolerance tournament transform translate transport traveller treatment
    trembling twentieth ultimatum uncertain underline universal unusually vegetable versatile vibration
    victorious volunteer warehouse waterfall wavelength wednesday wonderful worldwide yesterday`,
  10: `absolutely acceptable accessible accomplish accountant accurately adjustment admiration adventurer
    aggressive allocation alteration ambassador amplitude anticipate apparently appearance application
    appreciate approaching artificial assessment assignment associated assumption atmosphere attendance
    attraction automobile background bankruptcy basketball battleship beneficial biological blackboard
    boundaries brightness brilliance broadcasts calculator capability celebrated centrifuge chancellor
    characters cinematics collection combustion commentary commercial commission commitment comparison
    competitor completion complexity compromise concerning conclusion conference confidence connection
    consistent constraint consultant contribute controller convention cooperator copyrights correction
    creativity credential curriculum cybernetic definition democratic department dependency depression
    descending determined developing dictionary difference difficulty directions disability discipline
    discussion dispatcher distortion documented electronic elementary elevations employment encryption
    engagement enthusiasm equivalent especially evaluation eventually everything excitement exhibition
    expedition experience experiment explorer's expression extinction extinguish facilitate friendship
    frustrated generation girlfriend government graduation gravitational hemisphere historical horizontal
    hypothesis illuminate imagination immigrants importance impossible impression incredible individual
    industrial inevitable inflatable initiative innovation inspection instrument integrated interstellar
    investment invitation kilometers laboratory leadership legitimate lieutenant lighthouse likelihood
    limitation literature locomotive magnetosphere management manuscript mechanical meditation membership
    microphone millennium ministries motivation mysterious negotiator neutronium newsletter noteworthy
    nutrition objectives obligation occasional occupation octahedron opposition optimistic ordinarily
    organizing originally outrageous overlooked parliament passionate perception percentage perfection
    periodical permission personally persuasion phenomenon philosophy photograph playground population
    positioned possession powerhouse preference preparation presidency prevention previously principles
    processing production profession programmer projection prominence properties proportion prosperity
    protection protective psychology punishment qualifying quantities quarantine reasonable recognized
    recreation references reflection regulation relatively reluctance remarkable renovation repetition
    reputation resistance resolution respective restaurant retirement revolution scientific screenshot
    settlement simulation situations skateboard smartphone specialist spacecraft spectacular statistics
    strategist strengthen structural subsequent substitute successful supervisor supplement surrounded
    suspension sustainable technology television temperature tournament traditions transition triggering
    turbulence underwater university unexpected upholstery vegetables vulnerable wanderlust watermelon
    widespread wilderness withdrawal workstation`,
  11: `accelerator achievement acknowledge acquisition advancement advertising affiliation afterburner
    agriculture alternative anniversary anticipated application appointment approximate arrangement
    assessments association atmospheric attractions authorities battlefield beneficiary broadcaster
    calculation candlelight celebration certificate challenging circulation collaborate combination
    comfortable commutative competition compilation complicated composition comprehends concentrate
    conditioner confederate connections consciously consequence conservator considering consistency
    constellation construction consultants contemplate continental contraption contributor controversy
    convenience cooperation corporation countryside declaration decorations demonstrate destination
    development differently disappeared distinguish distributor documentary electricity elimination
    embarrassed encouraging endorsement engineering enhancement entertainer environment equilibrium
    established examination expectation expenditure experienced explanation exploration expressions
    extravagant familiarity fascinating fundamental grandfather handwriting hospitality hyperdrives
    illustrated imagination immediately improvement independent individuals informative ingredients
    inheritance initiatives inspiration installment institution instruction integration intelligent
    interaction internation interpreter interrupted interstitial investigate involvement lightweight
    maintenance manufacture marketplace mathematics measurement mechanisms mediterranean millionaire
    misfortunes necessarily neighboring nonetheless observation occasionally opportunity organizations
    outstanding overwhelming parenthesis participant partnership performance personality perspective
    photography playwrights politically possibility practically preparation presentation preservation
    probability proceedings professional progressive proposition prosecution publication quarterback
    realization recognition recommended recruitment reflections refrigerate registration reservation
    residential resignation restoration scholarship shipbuilder significant snowboarder spacewalker
    spectacular speculation sponsorship stakeholder subscription substantial successfully superiority
    surrounding suspiciously sustainable temperature theoretical thermometer thunderstorm tournament
    transformer translation transmitted transparent unfortunate unnecessary vaccination voluntarily`,
  12: `accidentally accomplished acknowledged additionally advantageous anticipation appreciation
    appropriated architecture arrangements astronautics availability breakthrough bureaucratic
    calculations championship circumstance collectibles collaborated combinations commissioned
    commonwealth commercially communicator compensation competitive complication comprehensive
    concentrated conglomerate consequences considerable consolidated constellation construction
    contemporary continuously contribution conversation coordination craftmanship cryptography
    demonstrated departmental descriptions determination developments differential disappointed
    discriminate distribution dramatically electrifying encyclopedia entertaining entrepreneur
    establishing evolutionary exaggeration experimental extinguisher extraordinary floodlighting
    headquarters hydrodynamic hypothetical illumination illustration imaginations immeasurable
    implementing independence increasingly indefinitely infrastructure installation instrumental
    intelligence interference intermediate interruption intervention introduction investigation
    jurisdiction laboratories lightheaded magnificence manufactured mathematical meaningfully
    metropolitan microscopic misconception neighborhood nevertheless notification observations
    occasionally optimization organization overwhelming particularly partnerships perseverance
    photographer powerlessness predominantly preservation presidential productivity professional
    proportional publications qualifications questionable recognizable recommending relationship
    remarkabilty representing requirements respectfully satisfaction seismometer significance
    sophisticated spaceflights spectacularly spokesperson stabilization straightaway strengthened
    subscription successfully supplemental surroundings sustainability technologies thunderstruck
    transmission unbelievable unexpectedly unforgettable universities unquestioned wavelengths`,
};

// keep only clean words of exactly the listed length (a few above are longer
// or carry punctuation; they are dropped rather than trusted)
const NOT_WORDS = new Set(['asteer', 'warner', 'internation', 'remarkabilty', 'craftmanship', 'lemony']);
export const WORDS = {};
for (const [len, s] of Object.entries(RAW)) {
  const n = +len;
  WORDS[n] = [...new Set(s.trim().split(/\s+/))].filter(w => /^[a-z]+$/.test(w) && w.length === n && !NOT_WORDS.has(w));
}
export default WORDS;
