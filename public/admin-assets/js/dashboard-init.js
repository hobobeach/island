
      $(function () {

        var start = moment().subtract(30, 'days');
        var end = moment();

        function cb(start, end) {
          $('#reportrange span').html(start.format('D MMM') + ' - ' + end.format('D MMM'));
        }

        $('#reportrange').daterangepicker({
          startDate: start,
          endDate: end,
          ranges: {
            'Today': [moment(), moment()],
            'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
            'Last 7 Days': [moment().subtract(6, 'days'), moment()],
            'Last 30 Days': [moment().subtract(29, 'days'), moment()],
            'This Month': [moment().startOf('month'), moment().endOf('month')],
            'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf(
              'month')]
          }
        }, cb);

        cb(start, end);

      });

    

      //Chart Sales overview
      var optionsSalesOverview = {
        colors: ["var(--bs-primary)", "var(--bs-info)"],
        series: [{
            name: 'Direct',
            data: [144, 155, 187, 156, 261, 247, 163,
              144, 155, 257, 156, 261, 224, 163,
              144, 155, 257, 156, 261, 198, 163,
              144, 155, 257, 156, 261, 274, 163, 257, 156
            ],
          },
          {
            name: 'Ads',
            data: [76, 85, 101, 98, 87, 124, 91,
              76, 85, 101, 98, 54, 105, 97,
              76, 85, 101, 124, 87, 94, 91,
              76, 85, 101, 78, 104, 135, 104, 98, 87
            ],
          },
        ],

        chart: {
          type: 'area',
          height: 325,
          fontFamily: 'Inherit',
          toolbar: {
            show: false
          }
        },
        dataLabels: {
          enabled: false
        },
        stroke: {
          width: 2,
          curve: 'smooth',
        },
        grid: {
          strokeDashArray: 2,
          padding: {
            top: 0,
            bottom: 0,
            right: 20
          },
          xaxis: {
            lines: {
              show: true,
            },
          },
          yaxis: {
            lines: {
              show: false,
            },
          },
        },
        labels: ["Jan 1", "Jan 2", "Jan 3", "Jan 4", "Jan 5", "Jan 6", "Jan 7",
          "Jan 8", "Jan 9", "Jan 10", "Jan 11", "Jan 12", "Jan 13", "Jan 14",
          "Jan 15", "Jan 16", "Jan 17", "Jan 18", "Jan 19", "Jan 20", "Jan 21",
          "Jan 22", "Jan 23", "Jan 24", "Jan 25", "Jan 26", "Jan 27", "Jan 28", "Jan 29", "Jan 30",
        ],

        yaxis: {
          labels: {
            show: true
          },
        },
        xaxis: {

          tickAmount: 6,
          labels: {
            show: true,
            rotate: 0
          },
          tooltip: {
            enabled: false
          },
          axisTicks: {
            show: false,
          },
          axisBorder: {
            show: false,
          },
        },
        fill: {
          type: 'gradient',
          gradient: {
            shadeIntensity: 1,
            opacityFrom: .05,
            opacityTo: 0,
            stops: [0, 100]
          }
        },
        tooltip: {
          shared: true,
          intersect: false,
          y: {
            formatter: function (val) {
              return val + ' <span class="fw-normal text-body-secondary">Products sold</span>';
            },
          },
        },
        markers: {
          strokeWidth: 5,
          strokeOpacity: 1,
          strokeColors: ["var(--bs-body-bg)","var(--bs-body-bg)","var(--bs-body-bg)"],
        },
      };
      var chartOverview = new ApexCharts(
        document.querySelector('#chart_overview'),
        optionsSalesOverview
      );
      chartOverview.render();

        //top countries
     var countryColors = ["var(--bs-primary)","var(--bs-warning)","var(--bs-info)","var(--bs-success)","var(--bs-danger)",];
      var optionsCountries = {
        
          series: [{ name:"Visitors",
          data: [
            87, 82, 68, 49, 41
          ]
        }],
          chart: {
          type: 'bar',
          height: 300,
          fontFamily:'inherit',
          toolbar:{
            show:false
          }
        },
        legend:{
          show:false
        },
        colors: countryColors,
        grid:{
          strokeDashArray:4,
          position:"back",
          padding:{
            right:30,
            left:10,
            bottom:-10
          },
          xaxis: {
            lines: {
              show: true,
            },
          },
          yaxis: {
            lines: {
              show: false,
            },
          },
        },
        plotOptions: {
          bar: {
            columnWidth:'30%',
            horizontal: false,
            distributed:true,
            borderRadius:0,
            dataLabels: {
              position: 'top',
            },
          }
        },
        labels:{
          show:false
        },
        dataLabels: {
          enabled: false,
        },
        stroke: {
          show: false
        },
        xaxis: {
          categories: ['USA', 'India', 'UK', 'France', 'Canada'],
          axisTicks: {
            show: true,
          },
          axisBorder: {
            show: false,
          },
        },
        yaxis:{
          labels:{
            show:true
          },
          axisTicks: {
            show: false,
          },
          axisBorder: {
            show: false,
          },
        },
        tooltip: {
          y: {
            formatter: function (val) {
              return val + 'k <span class="fw-normal text-body-secondary"></span>';
            },
          },
        },
        };

        var chartCountries = new ApexCharts(document.querySelector("#chart_top_countries"), optionsCountries);
        chartCountries.render();

    
