//▼ここから関数集
//GETパラメータ取得
function GetParams(){
	let sQuery = window.location.search.replace(/^\?/,'');
	if(!sQuery) {return;}
	
	let sParams = sQuery.split('&');
	let bFlgT=0, bFlgP=0;
	let sMap='NA';
	for(let i=0; i < sParams.length; i++){
		let elem = sParams[i].split('=');
		if(elem.length < 2) {continue;}
		
		if(elem[0]=='lat' && !isNaN(elem[1])){dLat=Number(elem[1]); bFlgP=1; }
		else if(elem[0]=='lon'&& !isNaN(elem[1])){dLon=Number(elem[1]); bFlgP=1; }
		else if(elem[0]=='z'&& !isNaN(elem[1])){dZoom=Number(elem[1]);  bFlgP=1; }
		else if(elem[0]=='t0'&& !isNaN(elem[1])){dMinT=Number(elem[1]); bFlgT=1; }
		else if(elem[0]=='dt'&& !isNaN(elem[1])){dTStep=Number(elem[1]); bFlgT=1; }
		else if(elem[0]=='b_map'){ sMap=elem[1]; }
	}
	
	//位置・縮尺設定
	if(bFlgP){
		map.setView([dLat, dLon], dZoom);
	}
	
	//気温設定(HTML上のコントロール反映)
	if(bFlgT){
		document.legend_temp.elements[0].checked = false;
		document.legend_temp.elements[1].checked = true;
		$('[name="tscale"]').val("original");
		document.legend_temp.elements[2].value=dMinT;
		document.legend_temp.elements[3].value=dTStep;
		document.legend_temp.elements[2].disabled=false;
		document.legend_temp.elements[3].disabled=false;
	}
	
	//背景図選択
	if(sMap == 'blk' || sMap == 'shd' || sMap == 'pal'){
		$('[name=lyr]').val([sMap]);
		SelectMap(sMap);
	}
}

//最新時刻から288個(48時間分:6x48hr)の時刻を取得してOptionタグに追加する
function GetTimes(){
	let url='https://www.jma.go.jp/bosai/amedas/data/latest_time.txt';
	let rd = new FileReader();
	let xmlHttp = new XMLHttpRequest();
	xmlHttp.open("GET",url,true);
 	xmlHttp.send(null);
	xmlHttp.onload = function(){
		let data = xmlHttp.responseText;
		let dt = new Date(data);
		let elSel = document.getElementById("lsDateTime");
		
		//まず削除
		while(elSel.lastChild){elSel.removeChild(elSel.lastChild);}
		$("#btnExpandMenu").css({'padding': ""});
		$("#menu").css({'width': ""});
		
		GetObsInfo(formatDate(dt, "yyyyMMddHHmmss"));
		while(elSel.lastChild){ elSel.removeChild(elSel.lastChild); }
		for(let i = 1; i <= 288; i++){
			let elOpt = document.createElement("option");
			elOpt.text = formatDate(dt, "yyyy/MM/dd HH:mm");
			elOpt.value = formatDate(dt, "yyyyMMddHHmmss");
			elSel.appendChild(elOpt);
			dt.setMinutes(dt.getMinutes() - 10);
		}
		//メニューの幅を固定する
		let w = $("#menu").outerWidth(true);
		$("#menu").css({'width':w+10+"px"});
		
		//メニュー二段目の調整
		let w1 = $("#btnExpandMenu").outerWidth(true);
		let w2 = $("#btnCurPos").outerWidth(true);
		let p = (w-w1-w2)/2;
		$("#btnExpandMenu").css({'padding':"1px " + p+"px"});
		
		//メニュー(追加設定)の調整
		document.getElementById("sldRadar").style.width = (w-60)+"px";
		if($('[name="tscale"]').val() != "original"){
			document.legend_temp.elements[2].disabled=true;
			document.legend_temp.elements[3].disabled=true;
		}
	}
}

//メニュー表示・非表示
function ExpandMenu(){
	let elSub = document.getElementById("menu_sub");
	if(elSub.style.display=="block"){elSub.style.display="none";}
	else{elSub.style.display="block";}
}

//リストボックスで選択された日付を渡す(AMeDAS)
function GetSelectedDateForA(){
	//リストボックスで選択された値(日付:yyyyMMddHHmmSS)
	const DateTime = document.getElementById("lsDateTime").value;
	GetObsInfo(DateTime);
}

//±10分
function OffsetTime(iShift){
	let elOpt = document.getElementById("lsDateTime");
	let i;
	if(elOpt.selectedIndex+iShift < 0){
		i = 0;
	} else if(elOpt.options.length <= elOpt.selectedIndex+iShift){
		i = elOpt.options.length-1;
	} else {
		i = elOpt.selectedIndex+iShift;
	}
	elOpt.options[i].selected = true;
	GetObsInfo(elOpt.options[i].value);
}

//観測点の情報を持っているか判別した後で観測値取得関数を呼び出す
function GetObsInfo(DateTime){
	const url='https://www.jma.go.jp/bosai/amedas/const/amedastable.json';
	if(!htObsInfo){
		$.getJSON(url)
			.done(
				function(data, status, xhr){ htObsInfo = data; GetObsData(data, DateTime); }
			);
	} else {
		GetObsData(htObsInfo, DateTime);
	}
}

//観測値を取得する
function GetObsData(ObsInfo, DateTime){
	const url='https://www.jma.go.jp/bosai/amedas/data/map/' + DateTime +'.json';
	$.getJSON(url)
		.done(function(ObsData, status, xhr){
			//リセット
			gjPoints = new GeoJson();
			if(lyTempStr != null && map.hasLayer(lyTempStr)){ map.removeLayer(lyTempStr); lyTempStr=null; }
			if(lyTempCrl != null && map.hasLayer(lyTempCrl)){ map.removeLayer(lyTempCrl); lyTempStr=null;}
			if(lyWindBarbL != null && map.hasLayer(lyWindBarbL)){ map.removeLayer(lyWindBarbL); lyTempStr=null;}
			if(lyWindBarbS != null && map.hasLayer(lyWindBarbS)){ map.removeLayer(lyWindBarbS); lyTempStr=null;}

			//▼GeoJSON作成
			for (let code in ObsData) {
				if(code in ObsInfo === false) {continue;} //観測点情報が取れない場合は表示しない
				let dLon = ObsInfo[code].lon[0]+ObsInfo[code].lon[1]/60;
				let dLat = ObsInfo[code].lat[0]+ObsInfo[code].lat[1]/60;
				let dTemp = 'NA';
				if('temp' in ObsData[code]){
					if(ObsData[code].temp[1] == 0){ dTemp = ObsData[code].temp[0]; }
				}
				let dPrec1h = 'NA';
				if('precipitation1h' in ObsData[code]){
					if(ObsData[code].precipitation1h[1] == 0){ dPrec1h = ObsData[code].precipitation1h[0]; }
				}
				let dWindDir = 'NA';
				let dWindSpd = 'NA';
				if('wind' in ObsData[code]){
					if(ObsData[code].wind[1] == 0){ dWindSpd = ObsData[code].wind[0]; }
					if(ObsData[code].windDirection[1] == 0){ dWindDir = ObsData[code].windDirection[0]; }
				}
				//gjPoints:GeoJsonクラス→少し下で定義している(GeoJSONの書式に準拠)
				//PointFeatureクラス→こちらも下で定義、GeoJSONの地物の書式に準拠
				gjPoints.features.push(new PointFeature(dLon, dLat, code, ObsInfo[code].kjName, DateTime, dTemp, dPrec1h, dWindDir, dWindSpd));
  			}
  			
  			//▼レイヤ作成
  			//AMeDAS気温(str)
  			lyTempStr = L.geoJSON(gjPoints, {
  				onEachFeature: CreatePopup,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.Temp)){
  						let sCls = Temp2Cls(feature.properties.Temp);
  						let sTemp = feature.properties.Temp.toFixed(1);
  						return L.marker(latlng, {icon:L.divIcon({html:sTemp, className:sCls, iconSize:[50,16], iconAnchor:[25,-5], zIndexOffset:2000})});
  					}
  				}
  			});

  			//AMeDAS気温(Cercle)
  			lyTempCrl = L.geoJSON(gjPoints, {
  				onEachFeature: CreatePopup,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.Temp)){
  						let dT = feature.properties.Temp;
  						return L.circleMarker(latlng, {
  							radius:4, fillColor:Temp2Color(dT), fillOpacity: 1, color:"#000000", weight:0.5, pane:"PaneCircle",
  							attribution: "<a href='http://www.jma.go.jp/'>AMeDAS & 降水ナウキャスト:気象庁</a>" 
  						});
  					}
  				}
  			});

  			//AMeDAS風向風速(矢羽大)
  			lyWindBarbL = L.geoJSON(gjPoints, {
  				onEachFeature: CreatePopup,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.WindSpd) && !isNaN(feature.properties.WindDir)){
  						let iSpd = Math.round(feature.properties.WindSpd);
  						if(MaxWind < iSpd){iSpd = 99;}
  						let ico = L.icon({
  							iconUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconRetinaUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconSize: [16.5, 47.25],
  							iconAnchor: [2.25, 47.25],
  							popupAnchor: [0, 0],
  						});
  						let dAng = 22.5 * feature.properties.WindDir;
  						return L.marker(latlng, {icon: ico, rotationAngle: dAng});
  					}
  				}
  			});
			
  			//AMeDAS風向風速(矢羽小)
  			lyWindBarbS = L.geoJSON(gjPoints, {
  				onEachFeature: CreatePopup,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.WindSpd) && !isNaN(feature.properties.WindDir)){
  						let iSpd = Math.round(feature.properties.WindSpd);
  						if(MaxWind < iSpd){iSpd = 99;}
  						let ico = L.icon({
  							iconUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconRetinaUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconSize: [11, 31.5],
  							iconAnchor: [1.5, 31.5],
  							popupAnchor: [0, 0],
  						});
  						let dAng = 22.5 * feature.properties.WindDir;
  						return L.marker(latlng, {icon:ico, rotationAngle:dAng});
  					}
  				}
  			});
  			
  			
  			map.addLayer(lyTempCrl);
  			LayerSwitchByZScale();
		});
	//レーダーの表示制御
	if(document.getElementById("btnRadar").text != "非表示"){
		GetRadarTimes(DateTime);
	}
}

//レーダーの時刻を取得する
function GetRadarTimes(AMeDAS_Date){
	arRadarTs = new Array();
	const url='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json';
	$.getJSON(url)
		.done(
			function(data, status, xhr){
				for(let i in data){
					arRadarTs.push(data[i].basetime+data[i].validtime);
				}
				AddRadarLayer(AMeDAS_Date);
			}
		);
}

//レーダーのレイヤを追加する
function AddRadarLayer(AMeDAS_Date){
	if(lyRadar != null && map.hasLayer(lyRadar)){map.removeLayer(lyRadar); lyRadar=null;}
	let dtAMeDAS = Fmtd2DateTime(AMeDAS_Date);
	dtAMeDAS.setHours(dtAMeDAS.getHours() - 9); //JST→UTC
	AMeDAS_Date = formatDate(dtAMeDAS, "yyyyMMddHHmmss");
	let elRdr = document.getElementById("btnRadar");
	let dOpacity = 1 - Number(elSlider.value) /100;
	for(let i=0; i < arRadarTs.length; i++){
		let sB = arRadarTs[i].substring(0,14);
		let sV = arRadarTs[i].substring(14,28);
		if(sV == AMeDAS_Date){
			lyRadar = L.tileLayer('https://www.jma.go.jp/bosai/jmatile/data/nowc/'+sB+'/none/'+sV+'/surf/hrpns/{z}/{x}/{y}.png',
				{minZoom:4, maxZoom:16, maxNativeZoom:10, opacity: dOpacity, pane:"PaneRadar"}
			);
			map.addLayer(lyRadar);
			elRdr.text = "表示中";
			return;
		}
	}
	elRdr.text = "表示不可";
}

//レーダー画像の表示・非表示切り替え
function SwitchRadar(){
	if(map.hasLayer(lyRadar)){
		map.removeLayer(lyRadar);
		let elRdr = document.getElementById("btnRadar");
		elRdr.text = "非表示";
	}
	else{
		const AMeDAS_Date = document.getElementById("lsDateTime").value;
		AddRadarLayer(AMeDAS_Date)
	;}
}

//レーダー画像の透過度(スライダ)
function ChangeRadarOpacity(){
	if(lyRadar && map.hasLayer(lyRadar)){
		let dOpacity = 1 - Number(elSlider.value) /100;
		lyRadar.setOpacity(dOpacity);
	}
}

//ポップアップ
function CreatePopup(feature, layer) {
    if (feature.properties && feature.properties.Caption) {
		layer.bindPopup(feature.properties.Caption);
    }
}

//▼凡例
//気温から色に対応したクラス名を返す
function Temp2Cls(Temp){
	let i = Math.ceil((Temp-dMinT)/dTStep)
	if(i < 0){i = 0}
	else if(sColors.length <= i){i = sColors.length-1;}
	return "StrTemp" + ('00'+i).slice(-2);
}
function Temp2Color(Temp){
	let i = Math.ceil((Temp-dMinT)/dTStep)
	if(i < 0){i = 0}
	else if(sColors.length <= i){i = sColors.length-1;}
	return sColors[i];
}

//凡例種別制御
jQuery(function() {
	$('[name="tscale"]').on('change', function(){
		let val = $(this).val();
		let elMinT = document.legend_temp.elements[2];
		let elTStep = document.legend_temp.elements[3];
		
		if(val == "jma"){
			elMinT.disabled=true;
			elTStep.disabled=true;
			dMinT = -10;
			dTStep = 5;
			document.legend_temp.elements[2].value=dMinT;
			document.legend_temp.elements[3].value=dTStep;
			ReplaceURL();
		} else {
			elMinT.disabled=false;
			elTStep.disabled=false;
			ReplaceURL();
		}
		SetTempRange();
		map.removeControl(ctLegT);
		ctLegT = null;    		
		SwitchLegendT();
	});
});

//気温のレンジ・幅
function SetTempRange(){
	//凡例再描画
	if(ctLegT){
		map.removeControl(ctLegT);
		ctLegT = null;
	}
	SwitchLegendT();
	let elOpt = document.getElementById("lsDateTime");
	GetObsInfo(elOpt.options[elOpt.selectedIndex].value);
	ReplaceURL();
}

//気温のレンジ・幅
function SetTempRangeOriginal(){
	if(isNaN(document.legend_temp.elements[2].value)){dMinT = -10;}
	else{dMinT = Number(document.legend_temp.elements[2].value);}
	
	if(isNaN(document.legend_temp.elements[3].value)){dTStep = 5;}
	else{dTStep = Number(document.legend_temp.elements[3].value);}
	
	//凡例再描画
	if(ctLegT){
		map.removeControl(ctLegT);
		ctLegT = null;
	}
	SwitchLegendT();
	let elOpt = document.getElementById("lsDateTime");
	GetObsInfo(elOpt.options[elOpt.selectedIndex].value);
	ReplaceURL();
}

//レンジ・幅を凡例に反映
function SwitchLegendT(){
	let elLegend = document.getElementById("btnLegend");
	if(!ctLegT){
		//凡例なし→凡例を作成して地図に追加する
		ctLegT = L.control({position: 'bottomright'});
		ctLegT.onAdd = function(map){
			let div = L.DomUtil.create('div', 'legend');
			div.innerHTML = "Temp.[℃]<br>";
			for(let i=sColors.length-1; 0 <= i; i--){
				let dTU = dMinT + dTStep*i;
				let dTL = dMinT + dTStep*(i-1);
				let dTM = (dTU+dTL)/2;
				if(i == 0){
					div.innerHTML +=
			    	'<i style="background:' + Temp2Color(dTM) + '"></i> &lt; ' + dTU + '<br>';
		    	}else if(i < sColors.length-1){
					div.innerHTML +=
			    	'<i style="background:' + Temp2Color(dTM) + '"></i> ' + dTL + ' &ndash; ' + dTU + '<br>';
		    	} else {
					div.innerHTML +=
			    	'<i style="background:' + Temp2Color(dTM) + '"></i> ' + dTL + ' &lt; <br>';
		    	}
			}
			return div;
		}
		ctLegT.addTo(map);
		elLegend.text = "表示中";

	} else {
		map.removeControl(ctLegT);
		ctLegT = null;
		elLegend.text = "非表示";
	}
}

//▼GeoJson関連の定義
class GeoJson{
	constructor(){
		this.type = 'FeatureCollection';
		this.name = 'AMeDAS';
		this.features = [];
	}
}
class PointFeature{
	constructor(x, y, Code, Name, DateTime, Temp, Prec1h, WindDir, WindSpd){
		let sTemp=Temp;
		if(!isNaN(Temp)){sTemp=Temp+'℃';}
		let sPrec1h=Prec1h;
		if(!isNaN(Prec1h)){sPrec1h=Prec1h+'mm';}
		let sWindDir=WindDir;
		if(!isNaN(WindDir)){sWindDir=22.5*WindDir+'°';}
		let sWindSpd=WindSpd;
		if(!isNaN(WindSpd)){sWindSpd=WindSpd+'m/s';}
		
		this.type="Feature";
		this.properties={};
		this.properties['Code']=Code;
		this.properties['Name']=Name;
		this.properties['TempFlg']=0;
		this.properties['Temp']=Temp;
		this.properties['Prec1h']=Prec1h;
		this.properties['WindDir']=WindDir;
		this.properties['WindSpd']=WindSpd;
		this.properties['Caption']= 
			Name +'<br>'+
			DateTime2Fmtd(DateTime) +'<br>'+
			'気温:'+ sTemp + '<br>' +
			'降水量:'+ sPrec1h + '<br>' +
			'風向:'+ sWindDir + '<br>' +
			'風速:'+ sWindSpd + '<br>' +
			'<a href="https://www.jma.go.jp/bosai/amedas/#amdno=' + Code +'" target=" _blank">表形式(気象庁サイト)</a>';
		this.geometry={};
		this.geometry['type']="Point";
		this.geometry['coordinates']=[];
		this.geometry['coordinates'][0]=x;
		this.geometry['coordinates'][1]=y;
	}
}

//▼日付処理関係
//Dateオブジェクトから指定書式の文字列を返す
//https://zukucode.com/2017/04/javascript-date-format.html
function formatDate (date, format) {
	format = format.replace(/yyyy/g, date.getFullYear());
	format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
	format = format.replace(/dd/g, ('0' + date.getDate()).slice(-2));
	format = format.replace(/HH/g, ('0' + date.getHours()).slice(-2));
	format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
	format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
	format = format.replace(/SSS/g, ('00' + date.getMilliseconds()).slice(-3));
	return format;
};
//yyyyMMddHHmmSS→ yyyy/MM/dd HH:mm
function DateTime2Fmtd(DateTime){
	return 	DateTime.substring(0,4)+'/'+DateTime.substring(4,6)+'/'+DateTime.substring(6,8)+' '+
		DateTime.substring(8,10)+':'+DateTime.substring(10,12);
}

//yyyyMMddHHmmSS→Date
function Fmtd2DateTime(FormattedString){
	let iYr = Number(FormattedString.substring(0,4));
	let iMt = Number(FormattedString.substring(4,6))-1;
	let iDy = Number(FormattedString.substring(6,8));
	let iHr = Number(FormattedString.substring(8,10));
	let iMn = Number(FormattedString.substring(10,12));
	return new Date(iYr, iMt, iDy, iHr, iMn);
}

//スケールによる表示制御
function LayerSwitchByZScale(){
	dZoom = map.getZoom();
	if(dZoom < 9){
		if(map.hasLayer(lyTempStr)){map.removeLayer(lyTempStr);}
		if(map.hasLayer(lyWindBarbL)){map.removeLayer(lyWindBarbL);}
		if(lyWindBarbS){ map.addLayer(lyWindBarbS);}
	} else {
		if(map.hasLayer(lyWindBarbS)){map.removeLayer(lyWindBarbS);}
		if(lyWindBarbL){map.addLayer(lyWindBarbL);}
		if(lyTempStr) {map.addLayer(lyTempStr);}
	}
}

//URL変更
function ReplaceURL(){
	let sQuery = "lat=" + dLat + "&"
		+ "lon=" + dLon + "&"
		+ "z=" + dZoom + "&b_map=" + $('[name="lyr"]:checked').val();
	
	//気温レンジ
	if(dMinT != -10 || dTStep != 5){
		sQuery = sQuery + "&t0=" + dMinT + "&" + "dt=" + dTStep;
	}
	window.history.replaceState('', '', '?' + sQuery);
}

//背景図選択
jQuery(function() {
	$('[name="lyr"]').on('change', function(){
		let Name = $(this).val();
		ReplaceURL();
		SelectMap(Name);
	});
});
function SelectMap(Name){
	if(Name == "blk"){
		map.removeLayer(lyPal); map.removeLayer(lyShd); map.addLayer(lyBlk);
	} else if (Name == "shd"){
		map.removeLayer(lyPal); map.addLayer(lyShd); map.removeLayer(lyBlk);
	} else if (Name == "pal"){
		map.addLayer(lyPal); map.removeLayer(lyShd); map.removeLayer(lyBlk);
	}
}

//現在地へ移動する
function MoveToCurPos(){
	//現在地取得API対応
	if(!navigator.geolocation){
		alert("位置情報を取得できません(ブラウザが非対応)。");
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#888";
		return;
	}
	
	//位置情報取得Option
	//参考: https://www.achiachi.net/blog/leaflet/geolocation
	let opts = { enableHighAccuracy:false, timeout:5000, maximumAge:0 };
	
	//取得成功時
	function success(pos){ 
		map.setView([pos.coords.latitude, pos.coords.longitude]);
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#08F";
		return;
	}
	
	//取得失敗時
	function fail(ex) { 
		alert("位置情報を取得できません(タイムアウト・ブロック等)。"); 
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#888";
	}
	
	//コマンド実行
	navigator.geolocation.getCurrentPosition(success, fail, opts);
}
