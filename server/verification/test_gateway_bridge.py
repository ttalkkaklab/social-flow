"""Cross-language public gateway smoke; models replaced by fixtures.

Run from the gateway checkout using its test virtualenv and TEST_DATABASE_URL.
No model inference or external provider calls occur."""
import asyncio
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import sys

sys.path.insert(0, str(Path('tests').resolve()))
import httpx
import uvicorn
from conftest import app, client
from test_desktop import rig, asset
from test_image_bindings import binding, counts
from test_jobs import png
from test_speech_profiles import binding as speech_binding, wav

async def test_node_adapters_against_authenticated_gateway(app, client, rig, tmp_path):
    plugin = Path(__file__).resolve().parents[1] / 'dist'
    weights = tmp_path / 'fixture.safetensors'
    weights.write_bytes(b'fixture-weights-not-for-inference')
    app.state.settings.image_model_bindings = [binding(loras=[{'id':'style','path':str(weights)}])]
    source = tmp_path / 'source.png'
    source.write_bytes(png(256, 256))
    audio = tmp_path / 'source.wav'
    audio.write_bytes(wav(121000))
    app.state.settings.tts_model_bindings = [speech_binding(voices=[{'id':'narrator','reference_audio':str(audio)}])]
    video = tmp_path / 'source.mp4'
    subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=24','-t','0.1','-pix_fmt','yuv420p',str(video)],check=True)
    original = app.state.desktop.client
    async def upstream(request):
        p = request.url.path
        if p == '/v1/images/generations':
            body = json.loads(request.content)
            if body.get('mode') == 'edit':
                assert len(body['ref_images']) == 9
                assert body['lora_scales'] == [0]
                assert body['lora_paths'] == [str(weights)]
            return httpx.Response(200,json={'data':[{'b64_json':base64.b64encode(source.read_bytes()).decode()}]})
        if p == '/v1/audio/speech':
            body = json.loads(request.content)
            assert body['ref_audio'] == str(audio)
            assert body['instruct'] == 'Calm'
            assert body['max_tokens'] == 100
            return httpx.Response(200,content=audio.read_bytes(),headers={'content-type':'audio/wav'})
        if p.endswith('/bytes'):
            return httpx.Response(200,content=video.read_bytes())
        response = await original._transport.handle_async_request(request)
        if p.startswith('/api/generations/') and request.method == 'POST' and p != '/api/generations/edit/preflight':
            result = json.loads(response.content)
            result.update(status='succeeded',outputs=[asset()])
            rig['jobs'][result['id']] = result
            return httpx.Response(200,json=result)
        return response
    async with httpx.AsyncClient(transport=httpx.MockTransport(upstream)) as http:
        app.state.http = http
        from gateway.desktop import Desktop
        app.state.desktop = Desktop(app.state.settings,http)
        sock = socket.socket()
        sock.bind(('127.0.0.1',0))
        port = sock.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(app,log_level='error',lifespan='off'))
        task = asyncio.create_task(server.serve(sockets=[sock]))
        while not server.started:
            await asyncio.sleep(.01)
        code = '''
import {generateNativeImage} from 'PLUGIN/astra-genai-native-image.js';
import {generateGenaiSpeech} from 'PLUGIN/astra-genai-speech.js';
import {generateDesktopVideo} from 'PLUGIN/astra-genai-desktop.js';
import {genaiCatalog} from 'PLUGIN/astra-genai-client.js';
const out=process.env.SMOKE_OUTPUT;
const image={model:'qwen',prompt:'A blue ball',size:'256x256',outputPath:out};
await generateNativeImage({...image,filename:'generated.png'});
await generateNativeImage({...image,imagePath:out+'/source.png',refImagePaths:Array(9).fill(out+'/source.png'),loras:[{id:'style',scale:0}],filename:'edited.png'},true);
const speech=await generateGenaiSpeech({model:'vox',text:'Hello',voice:'narrator',instructions:'Calm',maxTokens:100,requestId:'cross-language',outputPath:out,filename:'speech.wav'});
if(!speech.success)throw new Error(speech.error);
const base={model:'ltx-2.5-fast',prompt:'A blue ball',resolution:'270p',duration:2,reserveUsd:0,outputPath:out};
const results=[];
results.push(await generateDesktopVideo('text-to-video',{...base,filename:'t2v.mp4'}));
results.push(await generateDesktopVideo('image-to-video',{...base,imagePath:out+'/source.png',lastFramePath:out+'/source.png',filename:'i2v.mp4'}));
const {duration,...a2v}=base;
results.push(await generateDesktopVideo('audio-to-video',{...a2v,audioPath:out+'/source.wav',imagePath:out+'/source.png',filename:'a2v.mp4'}));
const edit={model:base.model,prompt:base.prompt,duration:2,reserveUsd:0,outputPath:out,sourceVideoPath:out+'/source.mp4'};
results.push(await generateDesktopVideo('extend',{...edit,filename:'extend.mp4'}));
results.push(await generateDesktopVideo('retake',{...edit,startTime:0,mode:'replace_video',filename:'retake.mp4'}));
results.push(await generateDesktopVideo('keyframes',{...base,keyframes:[{imagePath:out+'/source.png',frameIndex:0},{imagePath:out+'/source.png',frameIndex:48}],filename:'keys.mp4'}));
const loras=await genaiCatalog('loras');
results.push(await generateDesktopVideo('text-to-video',{...base,loras:[{ref:loras.loras[0].ref,scale:0}],filename:'lora.mp4'}));
console.log(JSON.stringify({scenarioCount:results.length+3,complete:results.every(r=>r.downloaded)}));
'''.replace('PLUGIN',plugin.as_uri())
        env = {**os.environ,'ASTRA_GENAI_URL':f'http://127.0.0.1:{port}', 'ASTRA_GENAI_API_KEY':rig['headers']['Authorization'].split(' ',1)[1], 'SMOKE_OUTPUT':str(tmp_path)}
        try:
            process = await asyncio.create_subprocess_exec('node','--input-type=module','-e',code,env=env,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
            stdout,stderr=await asyncio.wait_for(process.communicate(),90)
            assert process.returncode == 0, stderr.decode()[-3500:]
            result=json.loads(stdout)
            assert result == {'scenarioCount':10,'complete':True}
            jobs,events=await counts(app)
            assert len(jobs)==len(events)==10
            assert all(job['status']=='succeeded' for job in jobs)
            print(result)
        finally:
            server.should_exit=True
            await task
