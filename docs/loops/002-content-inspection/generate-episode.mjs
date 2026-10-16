#!/usr/bin/env node
// Rewrites the existing webtoon in a fresh local channel. Validators resolve only from the selected installation.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const [pluginArg,dest,reviewFile] = process.argv.slice(2);
if(!pluginArg||!dest)throw new Error('Usage: generate-episode.mjs INSTALLED_PLUGIN_ROOT FRESH_CHANNEL_DIR [CANDIDATE_REVIEW_JSON]');
const plugin=path.resolve(pluginArg),channel=path.resolve(dest),source='/Volumes/data/repository/ttalkkaklab/ttalkkak-story/social-flow/data/gate-webtoon',episode=path.join(channel,'episodes/gate-beyond-rewrite'),board=path.join(episode,'storyboard'),old=path.join(source,'episodes/20261015-gate-beyond/storyboard');
if(fs.existsSync(channel))throw new Error('Destination must be fresh; earlier output is evidence.');
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v);};
const json=v=>JSON.stringify(v,null,2);
const run=(file,args=[],allowFailure=false)=>{const r=spawnSync(process.execPath,[path.join(plugin,file),...args],{encoding:'utf8'});if(r.status&&!allowFailure)throw new Error(`${file}: ${r.stdout}\n${r.stderr}`);return r;};
fs.mkdirSync(channel,{recursive:true});
fs.cpSync(path.join(source,'assets'),path.join(channel,'assets'),{recursive:true});
write(path.join(channel,'profile.original.md'),fs.readFileSync(path.join(source,'profile.md'),'utf8'));
write(path.join(channel,'profile.md'),fs.readFileSync(path.join(source,'profile.md'),'utf8')+'\n## 이번 검증용 재작성\n원본은 full_video·LTX 2.5 계획이다. 이번 사용자는 local/webtoon/no_video 스토리보드 검증을 선택했다. 원본 영상 승인이나 90점 검토를 재사용하지 않는다. 새로운 목표는 95점 이상이며 게시와 미디어 생성은 범위 밖이다.\nshortform_outro: off\ngenerated_video_max: 0\nlength_min_seconds: 35\nlength_max_seconds: 120\n');
fs.mkdirSync(board,{recursive:true});
fs.copyFileSync(path.join(old,'research.md'),path.join(board,'research.md'));
fs.appendFileSync(path.join(board,'research.md'),'\n## 이번 재확인\n2026-10-16 부모 세션이 ego-browser로 위 두 국사편찬위원회 자료를 다시 읽었다. 경찰 통제와 3·1운동의 선언·시위·진압만 확인했으며 2월 28일의 개별 연행은 창작이다. 확인 기록: docs/loops/002-content-inspection/source-check.md.\n');
const ids=['minjae','yeonhwa','jang-seokju'];
write(path.join(board,'cast.json'),json({characters:ids.map(id=>({id,source:`../../../assets/characters/${id}/identity.md`}))}));
const cast=[{id:'minjae',role:'자기가 팔아넘긴 길을 되돌릴 수 없는 청년',want:'권력자의 보호를 얻고 싶다가 자기 밀고의 대가를 감수한다.',voice:'처음은 비웃음 섞인 반말, 뒤에는 변명 없이 구체적으로 인정한다.',reason:'이익을 포기할 당사자다.'},{id:'yeonhwa',role:'선언서 운반을 준비하는 창작 인물',want:'동료와 자료를 지키고 운반 계획의 주도권을 유지한다.',voice:'짧고 구체적이며 민재의 반성을 칭찬하지 않는다.',reason:'피해자의 경계와 기존 운동의 주도권을 보여준다.'},{id:'jang-seokju',role:'방과 일당으로 밀고를 사는 창작 중개인',want:'민재에게 계속 정보를 얻는다.',voice:'협박을 거래 조건처럼 차분히 말한다.',reason:'민재가 얻은 보호의 조건을 실제로 제시한다.'}];
const a=(character,text)=>({kind:'action',character,text,basis:'invented'});
const d=(character,to,text)=>({kind:'dialogue',character,to,text,basis:'invented'});
const common=[
[a('minjae','현대의 어두운 방. 민재가 스마트 글래스를 쓴 채 커뮤니티에 글을 올리고 웃는다.'),d('minjae','self','식민지배 덕에 살 만해진 거지. 약하면 당하는 거고.'),a('minjae','안경 너머에만 푸른 문이 보인다. 민재가 안경을 내리면 문이 사라지고 다시 쓰면 나타난다. 그는 문을 넘는다.')],
[d('jang-seokju','minjae','드나드는 길만 알려 주면 돼. 방과 일당은 내가 대지.'),a('minjae','1919년 2월 28일의 경성. 민재가 인쇄소에서 나오는 연화와 종이 꾸러미를 보고 장석주에게 그 골목을 손가락으로 가리킨다. 장석주는 붉은 문 옆의 골목 입구를 수첩에 그린다.'),a('minjae','민재가 책상 위 봉투와 방 열쇠를 받아 주머니에 넣는다.')],
[a('minjae','장석주가 수첩의 붉은 문을 경찰에게 보여 준다. 그 붉은 문 옆 골목에서 경찰이 인쇄공을 끌고 간다. 민재의 손이 열쇠를 넣은 주머니 위에서 멈춘다.'),d('jang-seokju','minjae','약하면 당하는 거지.'),d('minjae','yeonhwa','내가 그 길을 알려 줬어요. 이 돈도 받았고요.'),a('minjae','민재가 봉투를 내밀지만 연화는 받지 않는다.'),d('yeonhwa','minjae','돈 주면 잡혀간 사람이 돌아와요?'),a('minjae','민재가 받지 않은 봉투를 주머니에 다시 넣는다.')],
[{...d('minjae','yeonhwa','저장 기록엔 내일 시위 뒤 검거가 있어요. 이 골목이 안전한지는 몰라요.'),basis:'interpretation',claims:[2,3]},a('minjae','민재가 안경테에서 손을 떼고 안경을 고쳐 쓴다. 연화는 봉투를 지나쳐 꾸러미의 매듭을 다시 조인다. 노출된 붉은 문 쪽 통로에 빗장을 건다.'),d('yeonhwa','minjae','그럼 노출된 길은 버려요. 동료들에게 먼저 알리겠어요.')]
];
const endings=[[
d('jang-seokju','minjae','밤에도 그 인쇄소를 봐. 그러면 방은 계속 네 거야.'),a('minjae','민재가 사무실 문밖 턱에 열쇠와 받은 봉투를 놓는다. 문 안의 장석주가 열쇠를 되밀지만 민재는 받지 않는다. 맞은편 창고 문 안에서 연화가 그 모습을 지켜본다. 장석주 쪽에서는 창고 안이 보이지 않는다.'),d('minjae','jang-seokju','누가 드나드는지는 더 안 팝니다.'),a('yeonhwa','연화가 창고 안의 동료에게 노출된 길을 지운 쪽지를 건네고 확인 표시를 돌려받는다. 문밖 턱의 열쇠와 등을 돌린 민재를 한 번 더 본다. 장석주의 문이 닫힌 뒤 작은 꾸러미 하나만 창고 안쪽 벤치에 놓는다.'),a('minjae','민재가 그 꾸러미를 두 손으로 든다. 연화는 나머지 꾸러미와 목적지가 적힌 종이를 자기 쪽으로 거둔다.'),d('yeonhwa','minjae','내가 보이는 데까지만 옮겨요. 다음 길은 우리가 정해요.'),a('minjae','민재가 고개를 끄덕이고 빈 주머니를 스친 뒤 창고 안쪽 중간 벤치로 꾸러미를 옮긴다. 연화가 두 걸음 뒤에서 끝까지 지켜본다. 나머지 종이와 목적지 쪽지는 동료 쪽에 있다.')],
[d('jang-seokju','minjae','아까 그 여자 이름은? 이름까지 주면 이 방은 네 거야.'),a('minjae','민재가 입을 열다 멈춘다. 손바닥의 열쇠를 책상에 놓고 받은 봉투를 그 옆에 밀어 둔다.'),d('minjae','jang-seokju','길을 판 것만으로도 사람을 잡아갔잖아요.'),a('yeonhwa','연화가 꾸러미 하나를 벤치에 놓고 뒤로 물러선다. 나머지 꾸러미와 이름 쪽지는 품에 감춘다.'),a('minjae','민재가 꾸러미를 두 손으로 든다.'),d('yeonhwa','minjae','이름도 목적지도 묻지 마요. 다음 골목에서 기다려요.'),a('minjae','민재가 이름 쪽지에서 시선을 거두고 정해진 골목으로 걷는다.')],
[d('jang-seokju','minjae','그 안경이면 다음 단속도 알겠지? 내게 먼저 말해.'),a('minjae','민재가 안경을 다시 쓰지만 빈 골목을 살피고 고개를 젓는다.'),d('minjae','jang-seokju','이 골목의 지금은 안 나옵니다. 당신한테 보낼 정보도 없고요.'),a('minjae','민재가 받은 봉투와 열쇠를 책상에 놓는다.'),a('yeonhwa','연화가 꾸러미 하나를 벤치에 놓고 손을 뗀다. 남은 종이는 자기 몸 뒤로 거둔다.'),a('minjae','민재가 꾸러미를 두 손으로 든다.'),d('yeonhwa','minjae','안경 말고 앞을 봐요. 다음 골목까지만.'),a('minjae','민재가 안경 너머의 빛 대신 실제 길을 보고 꾸러미를 옮긴다.')]
];
const differences=['방을 계속 얻으려면 밀고를 반복해야 한다는 재계약을 거절한다. 열쇠 반환과 제한된 운반이 물건으로 대비된다.','중개인이 연화의 이름을 요구한다. 민재는 남의 신원을 보호하려고 보수를 포기하며 연화는 이름과 목적지를 숨긴다.','중개인이 미래 기록을 독점하려 한다. 민재는 기록의 한계를 인정하고 현재의 길과 연화의 판단을 따른다.'];
const candidates=endings.map((ending,i)=>({kind:'adapted',expression:'mixed',engine:'intrigue',reveal:'none',premise:'식민지배를 찬양하던 청년이 가상의 1919년 경성에서 자기 밀고의 피해를 보고 이익을 포기한다.',viewerExperience:'주인공의 변명을 경계하다 실제로 포기한 이익과 제한된 신뢰를 확인한다.',message:'피해를 되돌릴 수 없어도 그 피해로 얻은 이익을 계속 받을지는 선택할 수 있다.',endingReason:'열쇠를 돌려주고 운반을 시작하되 용서와 전면적 신뢰는 얻지 못한다.',difference:differences[i],cta:'none',adaptationBoundary:'research.md #1–3의 식민 통치와 3·1운동 배경만 역사 기록이다. 1919년 2월 28일 경성의 세 주인공, 밀고·연행·운반, 대사와 시간 이동은 모두 창작이며 실제 운동의 결정이나 지도자를 대체하지 않는다.',cast,setups:[],beats:['훅','전개 #1','전개 #2','전개 #3','마무리','CTA'].map((item,b)=>({item,expectation:['말로 권력을 편들면 안전할 것 같다.','길만 알려 주면 손해가 없을 것 같다.','돈을 돌려주면 잘못을 씻을 수 있을까.','미래 정보가 곧 신뢰일까.','보호와 도움을 모두 얻을 수 있을까.','완결된 행동 뒤 설명을 덧붙이지 않는다.'][b],change:['자신이 찬양하던 과거에 실제로 들어간다.','본인이 목격한 길을 팔고 대가를 받는다.','밀고가 피해로 이어지고 돈은 거절당한다.','기록의 한계와 연화의 결정권을 인정한다.','보호를 포기하지만 운반 범위만 제한적으로 허락받는다.','행동에서 끝낸다.'][b],necessity:['현재의 신념을 다음 선택의 원인으로 둔다.','주인공 책임과 열쇠의 의미를 확정한다.','말뿐인 후회나 손쉬운 용서를 차단한다.','미래인이 독립운동을 지휘하지 않게 한다.','원래 얻었던 이익을 실제로 포기한다.','교훈이나 구독 요청으로 장면을 덮지 않는다.'][b],events:b<4?common[b]:b===4?ending:[]}))}));

// Alternatives change pursuit, resistance and resolution, not merely the last demand.
const alternativeEvents=[[
[a('yeonhwa','연화가 인쇄소 창을 닫는다. 밖에서 민재가 돈봉투를 내밀지만 창은 열리지 않는다.'),d('yeonhwa','minjae','돌려줄 곳은 여기 말고 그 사람 책상이겠죠.')],
[a('minjae','몇 시간 전. 민재가 현대 방에서 식민지배 찬양 글을 올리고 웃다 안경 속 문을 넘는다. 장석주의 방과 일당 제안을 받고 연화가 드나드는 길을 알려 준다.')],
[a('minjae','경찰이 그 길로 들어와 인쇄공을 끌고 간다. 민재가 장석주에게 길을 알려 준 값을 취소하자고 요구한다.'),d('jang-seokju','minjae','이미 쓴 정보는 못 돌려줘. 방만 돌려받지.')],
[a('minjae','민재가 장석주 앞에서 열쇠와 봉투를 내려놓고 사무실 문을 닫는다. 밖의 연화가 물건을 빈손으로 나온 민재를 확인한다.'),{...d('minjae','yeonhwa','내일 시위 뒤 검거 기록이 있어요. 여기 사람들의 길은 몰라요.'),basis:'interpretation',claims:[2,3]},a('yeonhwa','연화가 동료에게 노출된 길을 폐기하자고 알리고 동료에게 확인을 받는다.')],
[d('yeonhwa','minjae','받은 걸 돌려줘도 그 사람은 못 돌아와요.'),a('yeonhwa','연화가 민재가 내려놓았던 동전 한 개를 손에 돌려주고 창고 안의 빈 수레를 가리킨다.'),a('minjae','민재가 동전을 바닥에 버리지 않고 주머니에 넣는다. 연화가 지켜보는 앞에서 빈 수레를 새 운반 자리로 밀어 간다.')]
],[
[a('minjae','민재가 안경을 만지며 인쇄소 골목의 현재 단속 위치를 찾지만 저장 기록의 지도에는 그 골목이 없다.'),d('minjae','self','어디가 안전한지는 안 나오네.')],
[a('minjae','몇 시간 전. 현대에서 약자를 조롱하던 민재가 안경 속 문으로 과거에 들어온다. 장석주의 숙소 제안을 받고 직접 본 종이 운반 길을 넘긴다.')],
[a('minjae','경찰이 민재가 알려 준 길로 들어와 인쇄공을 연행한다. 민재가 연화에게 미래의 자료라면 피해를 만회할 수 있다고 말하려다 멈춘다.'),d('yeonhwa','minjae','우리 길을 누가 알려 줬죠?'),d('minjae','yeonhwa','내가요. 돈과 방을 받았어요.')],
[{...d('minjae','yeonhwa','기록엔 내일 시위 뒤 검거가 있어요. 이 골목을 찍은 건 내가 본 거였어요.'),basis:'interpretation',claims:[2,3]},a('yeonhwa','연화가 운반을 멈추고 동료에게 기존 길을 지우게 한다. 민재에게는 거리를 두라고 손짓한다.'),d('jang-seokju','minjae','또 알려 주면 방은 계속 쓰게 해 주지.')],
[a('minjae','민재가 장석주에게 열쇠와 봉투를 돌려놓는다. 연화가 맞은편 창고에서 거절을 확인한다.'),a('yeonhwa','연화가 동료와 변경 경로를 확인한 뒤 안쪽 빈 탁자만 민재에게 가리킨다.'),d('yeonhwa','minjae','기록 말고 내 손짓만 봐요. 종이는 우리가 옮겨요.'),a('minjae','민재가 안경을 쓴 채 시선을 연화의 손으로 옮기고 종이 없는 탁자부터 치운다. 연화가 동료와 꾸러미를 옮긴다.')]
]];
for(let c=1;c<=2;c++){
 candidates[c].beats.slice(0,5).forEach((b,i)=>{b.events=alternativeEvents[c-1][i];b.change=['환불을 시도하지만 피해자가 거부한다.','피해를 만든 거래를 되짚는다.','이미 쓰인 정보는 취소할 수 없다.','이익을 돌려주고 안전 결정을 피해자에게 맡긴다.','민감한 정보 없이 보조 일을 한다.'][i];b.necessity='이 후보의 선택과 다음 결과를 해당 행동으로 연결한다.';});
 candidates[c].endingReason=c===1?'이익을 돌려줘도 피해는 취소되지 않는다. 민감한 종이 대신 빈 수레를 미는 일만 맡는다.':'안경으로 만회하려던 인물이 자기 제보를 인정하고 정보 없는 빈 탁자부터 치운다.';
 candidates[c].difference=c===1?'봉투를 돌려주면 취소할 수 있다는 환불 논리가 피해자의 거부와 중개인의 답변으로 무너진다. 선언서를 받지 못하고 빈 수레를 미는 것으로 끝난다.':'미래 정보로 만회하려는 태도가 현재 위치를 알 수 없는 안경의 한계와 고백 앞에서 무너진다. 기록 대신 연화의 손짓을 보며 빈 탁자만 치운다.';
}

const q=(id,place,source,size,cast,props,frame,purpose,events,extra={})=>({id,place,source,size,cast,props,frame,purpose,events,phase:['modern'].includes(place)?'현대 저녁':['corner','yard'].includes(place)?'저녁':'낮',feel:purpose, ...extra});
const revisedPlan=[
q('mock','modern',2,'mcu',['minjae'],['smart-glasses'],'남성 민재의 얼굴은 화면 오른쪽, 모니터는 왼쪽 밖이다. 입가에 비웃음이 있고 눈은 모니터를 본다.','민재가 자기 조롱을 말한다.',[a('minjae','현대의 방. 민재가 식민지배 찬양 글을 올린 화면 앞에서 웃는다.'),d('minjae','self','식민지배 덕에 살 만해진 거지. 약하면 당하는 거고.')],{seconds:5}),
q('gate','modern',3,'ls',['minjae'],[],'민재의 뒷모습과 벽의 청록 문. 작은 렌즈 모양 경계 안에서만 문을 그려 안경을 통한 시야임을 보여준다. 문에는 손이 닿기 직전이다.','안경으로만 보이는 문을 발견한다.',[a('minjae','안경을 쓴 민재 앞에만 청록색 문이 보인다. 그는 손을 뻗는다.')],{effect:'pull'}),
q('arrival','lane',3,'ls',['minjae'],['smart-glasses'],'남성 민재가 골목 남쪽에 서고 북쪽 붉은 나무문과 당시 행인들이 보인다. 사라지는 청록 문은 그의 뒤다.','현재에서 가상의 1919년 경성으로 넘어온다.',[a('minjae','문 너머의 민재가 비포장 골목에 서 있다. 화면의 장소 표기는 1919년 2월 28일, 경성이다.')],{effect:'pan'}),
q('offer','office',4,'two',['minjae','jang-seokju'],['smart-glasses','room-key','pay-envelope'],'민재는 왼쪽, 장석주는 오른쪽 책상 뒤. 장석주의 양손 아래 열쇠와 닫힌 봉투가 있다. 두 사람의 얼굴과 책상을 함께 잡는다.','권력자는 관찰 정보를 돈과 방으로 사겠다고 한다.',[d('jang-seokju','minjae','드나드는 길만 알려 주면 돼. 방과 일당은 내가 대지.')]),
q('inform','lane',4,'two',['minjae','jang-seokju'],['smart-glasses','route-notebook'],'민재는 오른손으로 북쪽 붉은 문 옆 골목을 가리킨다. 옆 장석주의 왼손 수첩에는 같은 붉은 문 약도가 있다. 연화나 꾸러미는 이 프레임에 없다.','민재가 직접 본 통행로를 판다.',[a('minjae','민재가 연화가 드나들던 붉은 문 옆 골목을 가리킨다. 장석주의 펼친 수첩에는 같은 문과 골목 약도가 보인다.')],{effect:'pan'}),
q('receive','office',1,'insert',['minjae','jang-seokju'],['room-key','pay-envelope'],'민재의 왼손에 열쇠, 오른손에 봉투. 맞은편 장석주의 빈 손과 책상만 잡고 얼굴은 프레임 밖이다.','밀고의 보상이 민재의 손으로 넘어왔다.',[a('minjae','민재의 두 손에 방 열쇠와 보수 봉투가 있다. 장석주의 손은 비어 있다.')],{effect:'tilt'}),
q('stowed','office',1,'ls',['minjae'],['smart-glasses'],'주머니 입구에 손끝이 닿은 남성 민재. 열쇠와 봉투는 천 안에 완전히 가려졌다.','민재가 보상을 자기 것으로 보관한다.',[a('minjae','민재는 열쇠와 봉투를 후드 주머니에 넣은 채 자리에서 일어선다.')]),
q('notebook','lane',5,'insert',['jang-seokju'],['route-notebook'],'장석주의 왼손 수첩과 경찰의 손. 수첩에는 붉은 문과 오른쪽 골목이 있다. 인쇄공과 민재는 프레임 밖이다.','팔린 약도가 경찰에게 전달된다.',[a('jang-seokju','장석주가 붉은 문 약도가 펼쳐진 자기 수첩을 경찰에게 보여 준다.')],{effect:'tilt'}),
q('arrest','lane',5,'ls',['minjae'],['smart-glasses'],'북쪽 붉은 문 앞에서 경찰이 인쇄공의 팔을 붙잡은 순간. 남쪽 전경 민재의 얼굴과 주머니 위 멈춘 손을 보인다. 수첩은 이 컷에 없다.','본인의 정보와 피해가 같은 장소에서 이어진다.',[a('minjae','같은 붉은 문 앞에서 경찰이 인쇄공을 붙잡고 있다. 민재의 손이 주머니 위에서 멈춘다.')],{effect:'pull'}),
q('echo','office',6,'mcu',['jang-seokju'],[],'중년 남성 장석주의 얼굴. 시선은 화면 밖 왼쪽의 민재를 향한다. 빈 책상은 프레임 아래에 조금 보인다.','처음의 조롱을 가해자의 입에서 듣는다.',[d('jang-seokju','minjae','약하면 당하는 거지.')]),
q('confess','yard',7,'two',['minjae','yeonhwa'],['smart-glasses','pay-envelope'],'공개 하역마당. 민재는 남쪽에서 봉투를 오른손으로 내밀고 연화는 북쪽 잠긴 불투명 문 앞에 선다. 문 옆 경비 동료가 길을 막고 내부는 보이지 않는다.','민재가 보호된 작업장 밖에서 자기 밀고를 고백한다.',[a('minjae','민재가 잠긴 작업장 문밖에서 봉투를 내민다. 연화와 경비 동료가 입구를 막고 있다.'),d('minjae','yeonhwa','내가 그 길을 알려 줬어요. 이 돈도 받았고요.')]),
q('reject','yard',10,'mcu',['yeonhwa'],[],'여성 연화의 얼굴과 가슴 위. 뒤의 문은 닫혀 있고 눈은 화면 밖 남쪽 민재를 향한다. 봉투와 민재의 안경은 프레임 밖이다.','피해자는 돈으로 사건을 지울 수 없다고 거절한다.',[d('yeonhwa','minjae','돈 주면 잡혀간 사람이 돌아와요?')],{azimuth:45}),
q('pocket','yard',7,'ms',['minjae'],['smart-glasses'],'민재의 얼굴은 아래를 향하고 오른손이 후드 주머니 입구에 닿아 있다. 봉투는 이미 천 안에 가려져 보이지 않는다.','거절된 보수는 여전히 민재의 책임이다.',[a('minjae','민재가 거절당한 봉투를 다시 주머니에 넣은 채 고개를 숙인다.')]),
q('lookup','yard',8,'mcu',['minjae'],['smart-glasses'],'민재의 얼굴과 오른손 검지가 안경 다리의 검색 버튼에 닿은 순간. 문 앞의 연화는 프레임 밖이다.','안경에서 저장 자료를 직접 꺼낸다.',[a('minjae','민재가 안경 다리의 저장 자료 버튼을 누른다.')],{azimuth:45}),
q('archive','yard',8,'insert',[],[],'안경 속 자료 화면 하나. 저장된 역사 자료 / 국사편찬위원회 우리역사넷 / 3·1 운동 / 1919.3.1 항목을 HTML 글자로 정확히 조판한다. 현재 위치 지도는 없다.','저장 자료의 출처와 날짜를 보여준다.',[d('minjae','yeonhwa','안경에 저장한 역사 자료예요.')],{editorial:true,seconds:4}),
q('limit','yard',8,'two',['minjae','yeonhwa'],['smart-glasses'],'남쪽 민재와 북쪽 연화를 같은 높이에서 잡는다. 민재의 손은 안경에서 떨어졌고 연화는 문 앞 경계를 유지한다.','민재는 기록이 현재의 안전을 보장하지 않음을 인정한다.',[{...d('minjae','yeonhwa','내일 시위 뒤 검거가 있었대요. 지금 이 길이 안전한지는 몰라요.'),basis:'interpretation',claims:[2,3]}],{seconds:5,effect:'pull'}),
q('reroute','yard',9,'ms',['yeonhwa'],[],'여성 연화의 얼굴과 상반신. 잠긴 문 옆에서 남쪽 민재를 향해 말한다. 종이 작업물이나 경로 쪽지는 밖에 없다. 민재는 이 컷에 보이지 않는다.','연화가 이미 노출된 길을 폐기하고 기록의 경고에 대비한다.',[d('yeonhwa','minjae','이미 들킨 길은 버려요. 동료들과 시각도 다시 맞추겠어요.')]),
q('guard','yard',9,'ls',['yeonhwa','minjae'],['smart-glasses'],'문 옆 동료는 고개를 끄덕이며 안쪽 전달용 작은 문만 닫는다. 연화는 밖에 서고 민재는 남쪽 세 걸음 거리에 있다. 큰 문은 잠긴 채다.','안전 결정이 내부 동료에게 전달됐고 민재의 출입은 계속 막힌다.',[a('yeonhwa','경비 동료가 연화에게 확인의 끄덕임을 보인다. 민재 앞의 큰 문은 계속 잠겨 있다.')],{effect:'pull'}),
q('follow','corner',11,'ls',['minjae','yeonhwa'],[],'멀리 서쪽 장석주 사무실 문간을 향하는 민재, 동쪽 전경 모퉁이에 멈춘 연화. 원근으로 두 모퉁이 거리와 은폐 없는 관찰 위치를 보여준다. 하역장은 이 거리에서 보이지 않는다.','연화가 민재의 다음 행동을 직접 확인하려 거리를 두고 따라간다.',[a('yeonhwa','하역장을 떠난 민재 뒤로 연화가 거리를 두고 따라왔다. 그녀는 사무실이 보이는 골목 모퉁이에 멈춰 있다.')],{effect:'pan'}),
q('renew','corner',11,'two',['minjae','jang-seokju'],['smart-glasses'],'남쪽 골목의 민재와 북쪽 문 안 장석주. 문 오른쪽 돌턱이 비어 있다. 동쪽 모퉁이는 화면 밖이지만 같은 축을 유지한다.','보호의 조건이 계속되는 밀고임을 다시 확인한다.',[d('jang-seokju','minjae','밤에도 그 인쇄소를 봐. 그러면 방은 계속 네 거야.')]),
q('return','corner',12,'insert',['minjae'],['room-key','pay-envelope'],'문밖 돌턱에 놓인 열쇠와 닫힌 봉투. 민재의 빈 손은 두 물건에서 떨어져 있고 장석주의 손은 아직 닿지 않았다. 얼굴이나 연화는 보이지 않는다.','민재가 보수와 숙소 열쇠를 돌려놓는다.',[a('minjae','문밖 돌턱에 열쇠와 봉투가 나란히 놓여 있다. 민재의 손은 비어 있다.')],{effect:'tilt'}),
q('refuse','corner',12,'two',['minjae','jang-seokju'],['smart-glasses','room-key','pay-envelope'],'민재는 남쪽 왼편에서 빈 손을 내린 채 서고 장석주는 문 안 오른편이다. 돌턱의 열쇠를 민재 쪽으로 가리키는 장석주의 손. 봉투도 그대로 있다.','돌려받으라는 유혹에도 이익을 받지 않는다.',[a('minjae','장석주가 돌턱의 열쇠를 가리키지만 민재는 빈 손을 내린 채 서 있다.'),d('minjae','jang-seokju','누가 드나드는지는 더 안 팝니다.')],{azimuth:45}),
q('witness','corner',11,'ls',['yeonhwa','minjae','jang-seokju'],['room-key','pay-envelope'],'동쪽 모퉁이 연화의 어깨 너머로 남쪽 골목의 민재와 북쪽 문 안 장석주, 그 사이 돌턱의 두 물건이 한 시선에 보인다. 민재는 장석주에게서 몸을 돌렸다.','연화가 이익 포기를 실제 거리에서 확인한다.',[a('yeonhwa','연화의 시선 앞에서 민재는 빈 손으로 사무실에 등을 돌렸다. 열쇠와 봉투는 장석주 문밖 돌턱에 있다.')],{effect:'pull'}),
q('wet','yard',9,'ls',['yeonhwa','minjae'],['smart-glasses','paper-bundle'],'공개 하역마당으로 돌아온 두 사람. 북쪽 잠긴 문과 경비, 서쪽 바닥의 닫힌 꾸러미 하나에 가까워진 빗물, 동쪽 처마 아래 마른 탁자를 함께 보여준다.','기밀 정보와 무관한 작은 일이 실제로 필요하다.',[a('yeonhwa','다시 하역마당. 서쪽 처마에서 샌 빗물이 바닥의 닫힌 일반 용지 꾸러미 가까이 번져 있다. 동쪽 탁자는 말라 있다.')],{effect:'pan'}),
q('task','yard',10,'mcu',['yeonhwa'],[],'여성 연화의 얼굴과 상반신. 북쪽 잠긴 문 앞에서 화면 밖 동쪽 마른 탁자를 가리킨다. 시선은 화면 밖 남쪽 민재를 향한다.','연화는 감독 가능한 비밀 없는 일만 맡긴다.',[d('yeonhwa','minjae','아직 안 찍은 종이예요. 내 눈앞에서 저 마른 탁자까지만.')],{seconds:5}),
q('lift','yard',12,'ms',['minjae'],['smart-glasses','paper-bundle'],'남성 민재가 허리를 편 순간, 닫힌 갈색 꾸러미 하나가 양손에 있다. 젖어 가는 바닥과 비어 있는 원래 자리를 아래쪽에 보인다.','민재가 보수 없이 일반 용지 한 꾸러미를 든다.',[a('minjae','민재의 양손에 꾸러미 하나가 들려 있다. 빗물 앞의 원래 자리는 비었다.')],{effect:'tilt',azimuth:45}),
q('dry','yard',13,'ls',['minjae','yeonhwa'],['smart-glasses','paper-bundle'],'동쪽 마른 탁자에 놓인 동일한 닫힌 꾸러미와 그 옆 민재의 빈 양손. 뒤쪽 연화는 그를 지켜보고 북쪽 문은 잠겨 있다. 서쪽 바닥에는 물만 있다.','작은 도움이 끝나도 출입 제한과 불신은 사라지지 않는다.',[a('minjae','같은 꾸러미가 마른 탁자 위에 있다. 민재의 양손은 비었고 연화는 두 걸음 뒤에서 그를 지켜본다. 안쪽 문은 여전히 잠겨 있다.')],{effect:'pull',seconds:5})
];

const necessities=[
'민재 자신의 조롱을 먼저 들어야 장석주의 같은 말이 자기 인식으로 돌아온다.',
'안경에서만 보이는 문이 있어야 평범한 출입문으로 과거에 도착한 것처럼 보이지 않는다.',
'시대와 장소의 변화를 확인해야 다음 거래가 현대의 온라인 농담과 달라진다.',
'보상 조건이 먼저 제시돼야 민재의 제보가 우연한 도움이나 강요로 보이지 않는다.',
'민재가 직접 본 길과 장석주의 약도를 함께 보여 줘야 정보의 출처를 특정할 수 있다.',
'대가를 받는 손이 보여야 나중의 반환이 실제 이익의 포기가 된다.',
'보수가 주머니에 들어간 상태를 확정해야 고백과 반환에서 물건이 갑자기 생기지 않는다.',
'같은 약도가 경찰에게 전달돼야 정보와 검거 사이의 원인이 이어진다.',
'정보가 실제 사람을 해친 결과를 봐야 민재의 다음 고백에 계기가 생긴다.',
'자신의 조롱을 타인에게서 들어야 피해를 남의 문제로 치부하던 태도가 흔들린다.',
'입구 밖에서 정보와 보수를 함께 고백해야 책임을 인정하면서도 보호된 장소에 들어가지 않는다.',
'피해자의 거절을 들어야 환불이나 사과만으로 용서를 샀다는 결말을 막는다.',
'봉투를 다시 보관하는 컷이 있어야 장석주에게 돌려줄 동일한 봉투의 위치가 이어진다.',
'민재가 자료 버튼을 직접 눌러야 다음 화면이 저절로 나타난 전지적 정보처럼 보이지 않는다.',
'자료의 이름과 날짜를 직접 보여 줘야 미래 기록의 출처와 범위를 관객이 확인할 수 있다.',
'현재 길은 모른다고 밝혀야 기록이 안전한 경로나 개개인의 위치를 알려 주는 장치로 바뀌지 않는다.',
'연화가 결정해야 미래인이 독립운동의 운반을 지휘하는 이야기가 되지 않는다.',
'동료의 확인과 잠긴 문이 있어야 안전조치가 말뿐인 선언으로 끝나지 않는다.',
'연화가 따라온 위치를 먼저 보여 줘야 다음 선택을 어떻게 목격했는지 알 수 있다.',
'보호를 계속 받는 조건을 다시 들어야 민재가 무엇을 거절하는지 분명해진다.',
'반환한 열쇠와 봉투를 가까이 보여 줘야 손이 비었다는 다음 컷을 읽을 수 있다.',
'돌려받으라는 유혹 앞에서 손을 뻗지 않고 거절해야 일시적인 제스처로 보이지 않는다.',
'연화의 시선과 문간을 한 화면에 연결해야 제한된 일을 맡기는 판단의 근거가 생긴다.',
'젖는 바닥과 마른 탁자를 먼저 보여 줘야 작은 운반에도 구체적인 쓸모가 생긴다.',
'일반 용지와 감독 범위를 명시해야 기밀을 맡기거나 신뢰를 회복한 장면으로 읽히지 않는다.',
'같은 포장을 양손에 든 순간이 있어야 마지막 탁자에 나타난 물건의 이동 주체가 분명하다.',
'물건은 안전해졌지만 문은 잠겨 있어야 도움과 신뢰 회복을 같은 것으로 취급하지 않는다.'
];
revisedPlan.forEach((p,i)=>p.necessity=necessities[i]);
const beatRanges=[[0,3],[3,7],[7,13],[13,19],[19,27]];
candidates[0].beats.slice(0,5).forEach((beat,i)=>{beat.events=revisedPlan.slice(...beatRanges[i]).flatMap(p=>p.events);});
candidates[0].endingReason='열쇠와 보수를 포기한 뒤에도 기밀과 출입권을 얻지 못한다. 감독 아래 비에 젖기 직전의 일반 용지 한 꾸러미를 마른 탁자로 옮기는 작은 일로 끝낸다.';
const text=(c,i,frozen='')=>`---\nversion: scenario-v2\nchannel: ${path.basename(channel)}\ntopic: gate-beyond-rewrite\ndirection: D${i+1}\nfrozen: ${frozen}\n---\n\n\`\`\`scenario-json\n${json(c)}\n\`\`\`\n`;
candidates.forEach((c,i)=>write(path.join(board,`candidates/d${i+1}.md`),text(c,i)));
write(path.join(board,'candidate-check.json'),run('skills/storyboard/references/check-scenario.js',[path.join(board,'candidates'),'--json']).stdout);
write(path.join(board,'authoring-status.json'),json({status:'candidate_review_pending',installation:plugin,source:old,selected:null,mediaGenerated:false,approval:null,originalMode:'full_video',rewriteMode:'no_video',identitySchema:'legacy retained verbatim; structured migration pending'}));
console.log(json({channel,board,candidates:3,status:'candidate_review_pending'}));
if(!reviewFile)process.exit(0);
const selectionRecord=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
if(selectionRecord.selected!=='D1'||!selectionRecord.reason)throw new Error('Review/selection record must select D1 with actual provenance and reason.');
const require=createRequire(import.meta.url);
const {evaluateWindowScript}=require(path.join(plugin,'skills/_shared/scenes-vm.js'));
const original=evaluateWindowScript(fs.readFileSync(path.join(old,'scenes.js'),'utf8'));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.cpSync(path.join(old,'images'),path.join(board,'reference-images'),{recursive:true});
const chosen=candidates[0];
write(path.join(board,'scenario.md'),text(chosen,0,new Date().toISOString()));
write(path.join(board,'selection.json'),json(selectionRecord));
// Each entry is one frozen visual instant. Consequences occupy another cut.
const plan=revisedPlan;
const originalMeta={channel:'gate-webtoon',channelName:'게이트 너머',topic:'gate-beyond-rewrite',displayTitle:'게이트 너머 — 보호의 값 · 개정 스토리보드',series:'',status:'draft',created:'2026-10-16',keyMessage:chosen.message,hook:'민재가 자기 밀고의 대가를 마주한다.',seriesNote:'',docNotes:['원작 인물 참조를 활용한 계획. 모든 원화와 자료 화면은 제작 전이며 원본 이미지가 새 행동의 검증 결과를 뜻하지 않는다.','제작 전 미완성 항목: 새 샷 원화 26장, 실제 원화를 보고 지정할 tilt 초점 4건, 현재 계획의 비용 견적. 이 항목들은 아직 제작하지 않은 산출물이며 스토리보드 검토 통과가 제작 준비 완료를 뜻하지 않는다. 실제 이미지나 초점 좌표를 임의로 채우지 않았다.'],sceneNotes:{},transitions:[],privacy:{},audioNotes:{},sources:[],platforms:[],prep:[],recheck:[]};
const backgrounds={modern:'현대의 작은 방. 화면 왼쪽 책상과 모니터, 오른쪽 벽의 문. 청색 모니터 빛.',lane:'가상의 경성 거리. 북쪽 붉은 문, 문 오른쪽 좁은 골목, 남쪽 관찰 지점. 장석주의 사무실이나 하역장과 다른 거리다.',office:'장석주 사무실. 창 왼쪽 책상과 오른쪽 문, 책상 위 낮은 보관함. 낮의 첫 거래 공간.',yard:'공개 하역마당. 북쪽에는 안이 보이지 않는 잠긴 나무문과 경비 동료, 서쪽에는 비가 새는 처마와 젖은 바닥, 동쪽에는 마른 받침 탁자. 민재는 언제나 문밖이다. 선언서와 경로 정보는 안쪽 보관 공간에서 관리한다.',corner:'하역장과 두 모퉁이 떨어진 장석주 사무실 문간. 문은 남쪽으로 열리고 바깥쪽 오른편 돌턱이 보인다. 골목의 동쪽 모퉁이에서 문간과 돌턱을 비스듬히 볼 수 있다. 연화는 그 모퉁이에 머물며 민재와 거리를 둔다.'};
const win={FORMAT:'shorts-9x16',THEME:original.THEME,COMPREHENSION:{mode:'narrative',question:'민재는 왜 얻은 방을 포기할까?',answer:'자기 밀고로 사람이 잡혀가고 그 보호가 반복 밀고의 대가임을 깨달았기 때문이다.',takeaway:'이익을 포기해도 신뢰는 바로 돌아오지 않는다.',branches:[],terms:[]},PRODUCTION:{mode:'no_video',renderRatioVersion:1,imageProvider:'host',cast:original.PRODUCTION.cast,style:{...original.PRODUCTION.style,worlds:backgrounds,selection:{kind:'user',reference:'그래 기존 웹툰을 다시 작성해봐. 고고 — local/webtoon/no_video 스토리보드 검증 선택'}},videoBudgetUsd:0,maxAttempts:1},SB_DOC:{...originalMeta,characters:original.SB_DOC.characters.filter(c=>ids.includes(c.id)),speechPlanVersion:1,outro:null,sourceStatus:'legacy source, no new identity claims',backgrounds:Object.entries(backgrounds).map(([id,description])=>({id,name:id,description,status:'planned_geometry',references:[{path:`reference-images/scene-${({modern:2,lane:5,office:1,yard:9,corner:11})[id]}.png`,purpose:'재질과 시대 분위기 참고만 사용한다. 새 배치와 시선은 위 계획을 따른다.'}]})),craft:{loops:[]}},STRUCTURE:{version:'structure-v1',sequences:[],scenes:[],nextShotId:plan.length+1},SCENES:[]};
const names={minjae:'남성 민재',yeonhwa:'여성 연화','jang-seokju':'중년 남성 장석주'};
let sceneNo=0,lastPlace=null;
plan.forEach((p,i)=>{if(p.place!==lastPlace){sceneNo++;lastPlace=p.place;win.STRUCTURE.scenes.push({no:sceneNo,place:p.place,time:p.phase,event:p.events[0].text,charge:{open:'-',close:'--'},turn:p.purpose,out:p.events.at(-1).text});}else win.STRUCTURE.scenes.at(-1).out=p.events.at(-1).text;
const spoken=p.events.filter(e=>e.kind==='dialogue'),action=p.events.filter(e=>e.kind==='action').map(e=>e.text).join(' ');let group=0;
const framing=p.frame;const s={id:'s'+String(i+1).padStart(4,'0'),scene:sceneNo,type:i===0?'cover':'points',beat:i===0?'hook':'drip',title:i===0?'보호의 값':'',duration:p.seconds|| (spoken.length?5:4),transition:'cut',narration:spoken.map((e,j)=>({id:p.id+'-line-'+(j+1),speaker:e.character,delivery:p.editorial?'voiceover':p.size==='insert'?'off_screen':'on_screen',tts:e.text,sub:e.text,mediaStatus:'not_generated'})),performance:p.events.map(e=>e.kind==='action'?{kind:'action',character:e.character,text:e.text}:{kind:'dialogue',character:e.character,to:e.to,group:++group}),shot:{size:p.size,angle:p.size==='insert'?'high':'eye',cutType:p.size==='insert'?'insert':'action',infoType:'other',info:p.purpose,feel:p.feel,space:{frame:'camera',layout:framing,facing:p.facing||'인물은 그림에서 지정한 상대 또는 물건을 향한다.',line:p.line||'같은 장면의 북쪽 문과 남쪽 관찰 축을 넘지 않는다.',light:p.phase==='밤'?'서쪽 처마 등불, 얼굴과 손에 음영을 명료하게 준다.':'서쪽 창 또는 자연광'},coverage:{azimuth:p.azimuth||0},render:{mode:'still_camera',purpose:p.size==='insert'?'detail':p.size==='ls'?'place':'portrait',reason:p.purpose+' 한 순간과 다음 컷의 결과를 대비한다.',camera:{effect:p.effect||'push',target:p.target||framing,reason:p.purpose}},composition:{mode:'none',reason:'프레임 안 위치와 여백을 shot.space.layout에 지정했다.'},depth:{mode:'none',reason:'평면 웹툰 선화로 인물과 물체를 구분한다.'},dialogue:{mode:spoken.length?(p.editorial?'voiceover':p.size==='insert'?'off_screen':'on_screen'):'none',reason:spoken.length?'이 컷에서는 지정된 한 화자만 말한다.':'행동만 보여주는 컷이다.'},eyeline:{mode:'none',reason:'각 인물의 시선 목표를 프레임 설명에 지정했다.'},videoDesign:{worldId:p.place}},visual:{character:p.cast,action:action||names[spoken[0].character]+'가 지정된 상대를 보고 말한다.',backgroundId:p.place,source:'generated',bgPrompt:'Korean webtoon illustration. One frozen instant only. '+framing+' '+backgrounds[p.place]+' No sequence panels, no before-after montage. Preserve original character features.',referenceImages:[{path:`reference-images/scene-${p.source}.png`,purpose:'원작 분위기와 인물 참고이며 이 컷의 결과물이 아님'}],camera:{framing,movement:p.effect==='pan'?'pan right':p.effect==='pull'?'dolly out':p.effect==='tilt'?'tilt down':'dolly in',speed:'slow',end:p.target||framing},slide:{kind:'camera',motion:true,file:`slides/s${i+1}-${p.id}-camera.html`,plan:p.purpose},status:'planned'}};
if(p.editorial){s.shot.cutType='scenery';s.shot.render={mode:'editorial_html',purpose:'verdict',reason:'안경 속 저장 자료 화면을 HTML 글자로 정확히 제시한다.'};delete s.visual.bgPrompt;s.visual.slide={kind:'diagram',motion:true,treatment:'editorial',quality:'object-state-v1',role:'evidence',motif:'안경 속 저장 자료 카드',file:`slides/s${i+1}-${p.id}-archive.html`,plan:'안경에 저장한 역사 자료: 국사편찬위원회 우리역사넷 / 3·1 운동 / 1919.3.1. 독립선언·만세 시위·진압. 현재 골목 위치 정보는 없음. 역사 항목과 창작 UI를 구분한다.',subject:{kind:'type',changes:[{group:1,before:'저장된 역사 자료 목록',after:'3·1 운동 항목과 날짜',driver:'type'}]}};s.visual.source='authored';}
if(i===0){s.hookType='curiosity';s.hookForm='identify';s.shot.info='연출 — 마지막 열쇠 거절이 첫 조롱의 대가를 보여준다.';}if(i===plan.length-1){s.shot.share=win.COMPREHENSION.takeaway;s.shot.shareType='line';}win.SCENES.push(s);});

const dramaticScenes=[
{event:'민재가 안경 속 문을 발견한다.',turn:'조롱 → 낯섦',open:'+',close:'-'},
{event:'민재가 과거의 골목에 도착한다.',turn:'호기심 → 낯섦',open:'+',close:'-'},
{event:'장석주가 정보 거래를 제안한다.',turn:'빈손 → 거래 기회',open:'-',close:'+'},
{event:'민재가 골목을 가리킨다.',turn:'목격자 → 제보자',open:'-',close:'--'},
{event:'민재가 열쇠와 보수를 받는다.',turn:'빈 주머니 → 이익',open:'-',close:'+'},
{event:'경찰이 제보된 길에서 인쇄공을 붙잡는다.',turn:'정보 거래 → 피해',open:'+',close:'--'},
{event:'장석주가 약자를 조롱한다.',turn:'우월감 → 자기 혐오',open:'+',close:'-'},
{event:'연화가 고백과 저장 자료를 들은 뒤 안전 경계를 유지한다.',turn:'노출된 길 → 제한된 안전',open:'-',close:'+'},
{event:'민재는 빈 손을 내린 채 서 있다.',turn:'보호 약속 → 이익 포기',open:'+',close:'-'},
{event:'민재가 감독 아래 일반 용지를 옮긴다.',turn:'젖을 용지 → 마른 용지',open:'-',close:'+'}
];
win.STRUCTURE.scenes.forEach((s,i)=>{const d=dramaticScenes[i];s.event=d.event;s.turn=d.turn;s.charge={open:d.open,close:d.close};});
const index=id=>plan.findIndex(p=>p.id===id)+1;
const ref=(id,event=1)=>{const shot=index(id),s=win.SCENES[shot-1],e=s.performance[event-1];return {shot,event,quote:e.kind==='action'?e.text:s.narration[e.group-1].tts};};
win.STRUCTURE.sequences=[{id:'q1',title:'보호의 값',purpose:'민재가 밀고의 이익을 포기한다.',payoff:win.SCENES[index('refuse')-1].scene,scenes:win.STRUCTURE.scenes.map(s=>s.no)}];
win.SB_DOC.craft.loops=[{open:index('mock'),pay:index('dry'),what:'남을 조롱하던 민재가 피해를 만든 뒤 어떤 행동을 선택할까'},{open:index('offer'),pay:index('refuse'),what:'방과 일당의 거래를 다시 받아들일까'}];
win.STORY={version:'story-v2',kind:'adapted',expression:'mixed',reveal:'none',cta:'none',viewerNeed:chosen.viewerExperience,thesis:chosen.message,basis:'research.md #1–3 역사 배경. 나머지 인물·사건·대사는 창작. 안경은 저장 자료를 조회하며 현재 위치나 사람을 추적하지 않는다.',adaptationBoundary:chosen.adaptationBoundary,endingReason:'열쇠와 보수는 돌려주지만 용서를 받지 않는다. 보호된 작업장 밖에서 연화의 감독 아래 빗물에 젖기 전 평범한 용지 꾸러미 하나를 옮긴다.',cast:cast.map(c=>({...c,source:`../../../assets/characters/${c.id}/identity.md`})),opening:ref('mock'),payoff:ref('refuse'),ending:ref('dry'),beats:plan.map((p,i)=>({shot:i+1,change:p.purpose,necessity:p.necessity}))};
const props=[['smart-glasses','스마트 글래스','검정 테, 착용자 오른쪽 청록 표시. 손으로 만질 뿐 벗지 않는다.','../../../assets/characters/minjae/face.png'],['room-key','방 열쇠','금속 열쇠 한 개. 받았다가 돌려놓은 같은 물건.','reference-images/scene-1.png'],['pay-envelope','보수 봉투','황갈색 닫힌 봉투 한 개. 연화가 거절한 봉투를 민재가 장석주에게 돌려준다.','reference-images/scene-1.png'],['route-notebook','장석주의 수첩','붉은 문과 골목의 약도가 그려진 작은 수첩. 새 소품으로 아직 이미지가 없다.',null],['paper-bundle','일반 용지 꾸러미','인쇄 전 일반 용지. 네모난 갈색 포장에 꽉 묶인 불투명 꾸러미 하나. 잠긴 문밖 공개 하역장 바닥에서 마른 탁자로 옮긴다. 선언서나 경로 쪽지가 아니다.','reference-images/scene-12.png']];
win.SB_DOC.props=props.map(([id,name,description,reference])=>({id,name,description,appearanceVersion:1,tracking:'continuity',references:reference?[{path:reference,version:'1'}]:[]}));
const point=order=>({day:1,order}),state=(ownerId,holderId,location)=>({ownerId,holderId,location,condition:'intact'});
win.SB_DOC.propContinuity={version:1,timelineId:'gate-rewrite-d1',initial:[{propId:'smart-glasses',at:point(0),state:state('minjae','minjae','얼굴')},{propId:'room-key',at:point(0),state:state('jang-seokju','jang-seokju','책상 위 왼손')},{propId:'pay-envelope',at:point(0),state:state('jang-seokju','jang-seokju','책상 위 오른손')},{propId:'route-notebook',at:point(0),state:state('jang-seokju','jang-seokju','왼손')},{propId:'paper-bundle',at:point(0),state:state('yeonhwa',null,'공개 하역장 서쪽 바닥')}],events:[]};
const ev=(propId,kind,id,from,to,reason)=>win.SB_DOC.propContinuity.events.push({id:propId+'-'+id,propId,kind,at:point(index(id)*10),from,to,shotIds:[win.SCENES[index(id)-1].id],reason,recordedAt:new Date().toISOString(),recordedBy:'author'});
ev('room-key','lend','receive',{holderId:'jang-seokju',location:'책상 위 왼손'},{holderId:'minjae',location:'왼손'},'방 열쇠를 맡긴다.');
ev('pay-envelope','transfer','receive',{ownerId:'jang-seokju',holderId:'jang-seokju',location:'책상 위 오른손'},{ownerId:'minjae',holderId:'minjae',location:'오른손'},'밀고 대가로 봉투를 받는다.');
for(const [id,hand]of [['room-key','왼손'],['pay-envelope','오른손']])ev(id,'move','stowed',{holderId:'minjae',location:hand},{location:'후드 주머니'},'거래 뒤 보수를 주머니에 보관한다.');
ev('pay-envelope','move','confess',{holderId:'minjae',location:'후드 주머니'},{location:'오른손'},'자기 보수를 내밀며 고백한다.');
ev('pay-envelope','move','pocket',{holderId:'minjae',location:'오른손'},{location:'후드 주머니'},'거절당한 봉투를 다시 보관한다.');
for(const id of ['room-key','pay-envelope'])ev(id,'put_down','return',{holderId:'minjae',location:'후드 주머니'},{holderId:null,location:'사무실 문밖 돌턱'},'같은 열쇠와 봉투를 돌턱에 내려놓는다.');
ev('pay-envelope','transfer','return',{ownerId:'minjae',holderId:null,location:'사무실 문밖 돌턱'},{ownerId:'jang-seokju'},'받은 보수의 소유권도 포기한다.');
// Two same-prop state changes cannot share story-time: ownership transfer follows placement.
win.SB_DOC.propContinuity.events.at(-1).at.order+=1;win.SB_DOC.propContinuity.events.at(-1).id+='-ownership';
ev('paper-bundle','pick_up','lift',{holderId:null,location:'공개 하역장 서쪽 바닥'},{holderId:'minjae',location:'양손'},'빗물이 닿기 전 일반 용지를 들어 올린다.');
ev('paper-bundle','put_down','dry',{holderId:'minjae',location:'양손'},{holderId:null,location:'공개 하역장 동쪽 마른 탁자'},'감독 아래 일반 용지를 마른 곳에 놓는다.');
win.SB_DOC.propContinuity.events.sort((a,b)=>a.at.order-b.at.order);
win.SCENES.forEach((s,i)=>{const p=plan[i];s.visual.props=p.props||[];s.visual.propUsage=s.visual.props.map(propId=>({propId,start:point((i+1)*10+(p.id==='return'?1:0)),end:point((i+1)*10+(p.id==='return'?1:0)),visible:true,position:propId==='smart-glasses'?'민재의 얼굴':undefined}));});
const save=()=>write(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>`window.${k} = ${json(v)};`).join('\n'));
save();
write(path.join(board,'provenance.json'),json({sourceEpisode:old,sourceScenesSha256:sha(path.join(old,'scenes.js')),sourceIdentities:ids.map(id=>({id,path:path.join(source,'assets/characters',id,'identity.md'),sha256:sha(path.join(source,'assets/characters',id,'identity.md'))})),installation:plugin,createdAt:new Date().toISOString(),sourceApprovalReused:false,sourceMediaRole:'reference_only',humanStoryboardApproval:false}));
write(path.join(board,'storyboard.md'),'---\nstatus: draft\n---\n# 게이트 너머 — 보호의 값, 재작성\n\n'+plan.length+'컷. 원작의 인물과 세계를 보존하고 화자별 대사와 행동으로 다시 썼다. 역사 배경과 창작의 경계는 research.md에 적었다. 새 원화·영상·음성은 생성하지 않았다. 독립 이야기 평가와 최종 스토리보드 승인은 아직 받지 않았다.\n');
write(path.join(board,'story-draft-check.json'),run('skills/storyboard/references/check-story.js',[board,'--draft'],true).stdout);
write(path.join(board,'story-readable.txt'),run('skills/storyboard/references/check-story.js',[board,'--text'],true).stdout);
write(path.join(board,'scene-draft-check.json'),run('skills/storyboard/references/check-scenes.js',[board,'--draft','--json'],true).stdout);
run('skills/storyboard/references/storyboard-html.js',[board]);
const htmlPath=path.join(board,'storyboard.html');
write(htmlPath,fs.readFileSync(htmlPath,'utf8').replace(/<title>[^]*?<\/title>/,()=>'<title>게이트 너머 — 보호의 값 · 개정 스토리보드</title>').replace(/\/\* ✎ SB_DOC BEGIN[^]*?\/\* ✎ SB_DOC END \*\//,()=> '/* ✎ SB_DOC BEGIN */\nwindow.SB_DOC = '+json(win.SB_DOC).replace(/</g,'\\u003c')+';\n/* ✎ SB_DOC END */'));
run('skills/storyboard/references/storyboard-html.js',[board]);
const htmlCheck=run('skills/storyboard/references/storyboard-html.js',[board,'--check'],true);write(path.join(board,'html-check.json'),json({exitCode:htmlCheck.status,stdout:htmlCheck.stdout,stderr:htmlCheck.stderr}));
write(path.join(board,'authoring-status.json'),json({status:'draft_story_review_pending',installation:plugin,source:old,selected:'D1',mediaGenerated:false,approval:null,originalMode:'full_video',rewriteMode:'no_video',identitySchema:'legacy retained verbatim; no new identity claims'}));
console.log(json({board,status:'draft',shots:win.SCENES.length,review:'pending'}));
