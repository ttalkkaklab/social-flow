#!/usr/bin/env node
/** Plan independent visual studies; never declares an episode approved or publishable. */
import fs from 'node:fs';import path from 'node:path';
import contract from './animation-review-contract.cjs';
const args=process.argv.slice(2),outIndex=args.indexOf('--out'),imgIndex=args.indexOf('--images');
if(outIndex<0||imgIndex<0){console.error('Usage: plan-animation-review.mjs --out plan.json --images portrait1.png portrait2.png portrait3.png');process.exit(2)}
const images=args.slice(imgIndex+1,imgIndex+4).map(x=>path.resolve(x));
if(images.length!==3||images.some(p=>!fs.existsSync(p)))throw new Error('Three available portrait images are required; request generation through the host-approved image tool first.');
const clip=(id,lane,template,title,caption,intent,labels)=>({id,lane,template,title,caption,intent,duration:8,...(labels?{labels}:{})});
const clips=[
 clip('a1-conversation','still_camera','focus-in','대화에 집중하는 순간','상대의 말을 듣고 다음 말을 고르는 순간입니다.','대화의 중심인 왼쪽 인물의 얼굴이 흐림에서 선명해진다.'),
 clip('a2-consideration','still_camera','rack-focus','결정을 앞둔 사람','문서를 살피는 손에서 고민하는 표정으로 시선을 옮깁니다.','문서를 누르는 손에서 판단하는 얼굴로 초점을 옮긴다.'),
 clip('a3-departure','still_camera','pull','출발을 앞둔 아침','인물에서 주변 공간으로 물러나 준비된 현장을 보여줍니다.','인물 가까이서 시작해 수레와 보급소까지 천천히 보여준다.'),
 clip('b1-alliance','character_explanation','alliance','함께 계획 세우기','두 사람이 지도 위 말을 옮기며 계획을 맞춥니다.','두 사람이 지도 위 말을 손으로 옮긴 뒤 서로 고개를 끄덕인다.',['한쪽의 인장','상대의 인장']),
 clip('b2-document','character_explanation','document','기준을 확인하는 과정','문서를 함께 살핀 뒤 도장을 찍어 확인합니다.','한 사람은 문서를 짚고 다른 사람은 인장을 들어 도장을 찍는다.',['검토할 문서','확인용 인장']),
 clip('b3-supply','character_explanation','supply','출발 전 짐 점검','짐을 확인한 사람이 손잡이를 잡고 수레를 끕니다.','손잡이를 잡은 인물이 발을 번갈아 움직이며 수레를 끈다.',['적재한 포대','수레 바퀴']),
 clip('c1-gears','object_explanation','gears','회전은 어떻게 전달될까','맞물린 톱니바퀴는 반대 방향으로 돌고 큰 쪽은 더 천천히 돕니다.','잇수 16개와 32개의 기어가 2 대 1로 회전하는 관계를 보여준다.',['구동 기어 · 16개','종동 기어 · 32개']),
 clip('c2-pulley','object_explanation','pulley','당기는 방향 바꾸기','줄의 한쪽을 아래로 당기면 반대쪽 짐이 올라갑니다.','고정 도르래가 힘의 방향을 바꾸며 줄 길이를 일정하게 유지한다.',['올라가는 짐','고정 도르래']),
 clip('c3-hinge','object_explanation','hinge','축을 중심으로 열리는 뚜껑','경첩의 축은 제자리에 있고 뚜껑만 그 축을 따라 회전합니다.','휴대용 공구함의 뚜껑과 고정된 경첩을 함께 보여준다.',['열리는 뚜껑','고정된 회전축'])
];
Object.assign(clips[0],{purpose:'introduce',focusTo:[.31,.31,.18,.16]});
Object.assign(clips[1],{purpose:'inspect',focusFrom:[.33,.61,.18,.105],focusTo:[.35,.44,.16,.15]});
Object.assign(clips[2],{purpose:'context',focusTo:[.28,.38,.20,.20]});
clips[6].annotations=[{target:0,text:'16개 · 두 바퀴',reason:'잇수와 회전 수의 관계를 짚는다.',start:.5,end:2.8},{target:1,text:'32개 · 한 바퀴',reason:'큰 기어가 절반 속도로 회전함을 비교한다.',start:3.5,end:6.5}];
clips[7].annotations=[{target:0,text:'올라가는 짐',reason:'반대쪽 짐의 이동을 확인한다.',start:2.4,end:5.8}];
clips[8].annotations=[{target:1,text:'회전축은 제자리',reason:'뚜껑이 돌아도 고정된 축을 짚는다.',start:3.4,end:6.5}];
clips.forEach(c=>delete c.labels);
clips.slice(0,3).forEach((c,i)=>c.image=images[i]);
const plan={version:1,mode:'animation-review',title:'카메라와 3D 애니메이션 · 9종 검토본',status:'awaiting-user-review',clips};
const errors=contract.validate(plan);if(errors.length)throw new Error(errors.join('\n'));
const dest=path.resolve(args[outIndex+1]);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(plan,null,2)+'\n');console.log(dest);
