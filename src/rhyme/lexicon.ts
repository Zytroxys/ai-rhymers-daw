import { LEXICON_REF } from './rhyme';

/**
 * A seed lexicon: common English plus the vocabulary writers actually reach for.
 * It is deliberately small enough to read in a diff -- swap in a bigger list with
 * `setLexicon()` (any string array works) if you want deeper results.
 */
const WORDS = `
about above across action after again against age air all alone along already
also always angel anger answer anything apart apartment around art aside ask
asleep attack away awake back bad bag balance ball band bank bar bars base
basement battle beach bear beat beautiful because become bed been before begin
behind believe below best better between beyond big bill bird birth bit bite
black blade blame blast bleed blend bless blind block blood blow blue board
boat body bold bone book boom boss both bottle bottom bounce box boy brain
brake branch brand brave bread break breath breeze bridge bright bring broke
broken brother brought brown build building built burn bury bus business busy
buy cake call calm came camera can candle cannon car card care career careful
carry case cash cast castle catch cause cave ceiling cell center chain chair
chalk challenge champion chance change channel chaos chapter charge chart chase
cheap check cheer chest chew chief child choice choose chose church circle city
claim clap class clean clear clever climb clock close cloud club coast coat
code coffee cold collar color come comfort common company complete concrete
confidence conflict connect control cool copy corner cost couch could count
country couple courage course court cover crack craft crash crazy cream create
credit creep crew crime cross crowd crown cruel crush cry crystal culture cup
curse curve cut cycle damage dance danger dark daughter dawn day dead deal
dear death debt decide deep defeat degree delay deliver demand dent deny depth
desert design desire desk detail devil diamond die different difficult dig
dinner direct dirt distance divide dizzy dollar done door double doubt down
drag drain drama draw dream dress drift drink drive drop drown drug drum dry
dust duty each eager ear early earn earth ease east easy eat edge effort eight
either electric else empty end enemy energy engine enough enter equal escape
even evening ever every evil exact example excuse exit expect explain eye face
fact fade fail faith fall false family famous fan far fast fate father fault
favor fear feature feed feel feet fell fence few field fight figure file fill
film final find fine finger finish fire firm first fish fit five fix flag flame
flash flat flavor flesh flight float floor flow flower fly focus fog fold
follow food fool foot for force forest forever forget forgive form fortune
forward found four frame free freedom freeze fresh friend from front fruit full
fun funny future gain game garden gas gate gather gave general gentle get ghost
gift girl give glad glass glory glove go goal god gold gone good got grab grace
grade grain grand grant grass grave gray great green grew grind grip ground
group grow guard guess guest guide guilt gun guy habit hair half hall hand hang
happen happy hard harm hate have head heal heart heat heavy held hell hello
help here hero hide high hill hip history hit hold hole holy home honest honey
honor hood hook hope horizon horse hot hour house how huge human hundred hunger
hunt hurry hurt ice idea image imagine impact important inch inside instead
into iron island issue jacket jail jam jaw jealous job join joke journey joy
judge juice jump just keep key kick kid kill kind king kiss kitchen knee knew
knife knock know knowledge label labor lack ladder lady lake lamp land language
large last late laugh law lay lazy lead leaf lean learn least leave left leg
legend lesson let letter level liberty library lie life lift light like limit
line lip liquid list listen little live load loan local lock long look loose
lord lose loss lost loud love low loyal luck lunch lung machine mad made magic
mail main major make man many map march mark market marry mask master match
matter maybe mean measure meat medal medicine meet melody member memory mention
mercy mess message metal meter middle might mile milk million mind mine minute
mirror miss mission mistake mix model modern moment money monster month mood
moon more morning most mother motion motor mountain mouth move movie much music
must myself mystery nail naked name narrow nation native nature near neck need
needle neighbor neither nerve never new news next nice night nine noble noise
none noon normal north nose note nothing notice novel now number nurse object
ocean offer office often oil okay old once only open opinion order other ought
outside over own pace pack page pain paint pair palace pale palm panic paper
parade pardon parent park part party pass past path patient pattern pause pay
peace pen pencil people perfect perform perhaps period person phone photo piano
pick picture piece pile pilot pink pipe pitch place plain plan plane planet
plant plastic plate play please pleasure plenty pocket poem point poison police
polish pool poor pop port pose position possible post pound pour power practice
praise pray precious prepare present press pretty price pride print prison
private prize problem produce promise proof proper protect proud prove provide
public pull pulse pump punch pure purple purpose push put puzzle question quick
quiet quite race radio rage rain raise range rank rapid rare rate rather reach
read ready real reason rebel receive record red reflect refuse regret relax
release relief remain remember remind remove rent repair repeat reply report
rescue respect rest result return reveal reverse reward rhyme rhythm rib rich
ride right ring rise risk river road roar rock role roll roof room root rope
rose rough round route row royal rule run rush sad safe said sail saint sake
salt same sand save saw say scale scar scare scene school science score scratch
scream screen sea search season seat second secret section see seed seek seem
seize self sell send sense sent serious serve set settle seven several shade
shadow shake shall shame shape share sharp she shed sheet shelf shell shelter
shift shine ship shirt shock shoe shoot shop short shot should shoulder shout
show shower shut shy sick side sight sign silence silk silver simple since sing
single sink sister sit six size skill skin sky slave sleep slice slide slight
slip slow small smart smell smile smoke smooth snake snow so soft soil solid
solve some son song soon sorry sort soul sound soup source south space speak
special speed spell spend spin spirit split spoke sport spot spread spring
square squeeze stage stair stamp stand star start state stay steady steal steam
steel step stick still stock stone stop store storm story straight strange
stream street strength stress stretch strike string strip strong struggle study
stuff stupid style subject succeed such sudden suffer sugar suit summer sun
sunset supply support suppose sure surface surprise survive sweat sweet swim
swing switch sword symbol system table tail take talent talk tall tape target
task taste teach team tear tell temple ten tend tension term terrible test
than thank that the theater their them theme then theory there these they thick
thin thing think third thirst this those though thought thousand thread threat
three throat through throw thumb thunder ticket tide tie tight time tired title
today together tomorrow tone tongue tonight too took tool tooth top total touch
tough tour toward tower town trace track trade traffic tragic trail train
transfer trap travel treat tree trial tribe trick trip trouble truck true trust
truth try tune tunnel turn twelve twenty twice twin twist two type ugly under
understand union unit universe unless until upon upset urge use usual valley
value vein verse very victory video view village violence virtue vision visit
voice volume vote wage wait wake walk wall want war warm warn wash waste watch
water wave way weak wealth weapon wear weather weave wedding week weight
welcome well went were west wet what wheel when where whether which while
whisper white who whole why wide wild will win wind window wine wing winter
wire wise wish witness wolf woman wonder wood word work world worry worse worth
would wound wrap write wrong yard year yellow yes yesterday yet you young your
zone
`;

let lexicon: readonly string[] = Object.freeze(
  Array.from(new Set(WORDS.trim().split(/\s+/))).sort(),
);

LEXICON_REF.current = lexicon;

/** The word list `findRhymes` searches when no dictionary is passed. */
export function getLexicon(): readonly string[] {
  return lexicon;
}

/** Replace the default word list (e.g. with a full dictionary you fetched). */
export function setLexicon(words: readonly string[]): void {
  lexicon = Object.freeze(Array.from(new Set(words.map((w) => w.trim()).filter(Boolean))).sort());
  LEXICON_REF.current = lexicon;
}

/** Add words to the default list without replacing it. */
export function extendLexicon(words: readonly string[]): void {
  setLexicon([...lexicon, ...words]);
}
