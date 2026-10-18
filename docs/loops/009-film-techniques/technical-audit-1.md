# 독립 기술 검토 1

점수 없음. 평가 기준 확인을 기다리며 결함만 점검했다. 검토자: film_technique_audit.

1. spatial-prompts.js의 ASTRA와 Seedance 경로가 선택한 카메라 기법을 버린다. 동일 입력에서 rack-focus 선택 전후 motionPrompt가 같았다.
2. assemble-bg-prompt.js와 공간 프롬프트의 정지 이미지 경로가 rear 시점을 반영하지 않았다.
3. toString, constructor, __proto__가 기법 ID 검사를 통과하고 진단 중 예외를 일으켰다.
4. [null, null]처럼 잘못 쓴 선택 배열도 중복 진단에서 예외를 일으켰다.

수정: 상속 속성이 없는 ID 사전, null을 허용하는 오류 보고, 정지 이미지 전용 시점·초점 배치 지시, 두 실제 공간 영상 경로에 기법 전달. 재현 사례를 계약 검사에 추가했다.
