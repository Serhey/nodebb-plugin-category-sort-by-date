$(window).on('action:ajaxify.end', function () {
  require(['translator'], function(translator) {
    translator.translate('[[topic:topics_newest_to_oldest]]', function(newest_to_oldest) { 
      translator.translate('[[topic:topics_oldest_to_newest]]', function(oldest_to_newest) { 
        var sortEl = $('.category [component="thread/sort"] ul');
        sortEl.append('<li><a href="#" class="topics_oldest_to_newest" data-sort="topics_oldest_to_newest"><i class="fa fa-fw ' + (config.categoryTopicSort === 'topics_oldest_to_newest' ? 'fa-check' : '') + '"></i> ' + newest_to_oldest + '</a></li>');  
        sortEl.append('<li><a href="#" class="topics_newest_to_oldest" data-sort="topics_newest_to_oldest"><i class="fa fa-fw ' + (config.categoryTopicSort === 'topics_newest_to_oldest' ? 'fa-check' : '') + '"></i> ' + oldest_to_newest + '</a></li>');
      });
    });
  });
});
